import { tracked } from '@glimmer/tracking';
import Service, { inject as service } from '@ember/service';

import {
  type Board,
  generateBoard,
  getPositionsThatAlmostMatch,
  isAdjacent,
  isGameOver,
  type Position,
  swapTile,
} from '../game/board';
import { boardContains2048Tile } from '../utils/sharing';
import { sleep } from '../utils/sleep';
import {
  getGameState,
  getHighscore,
  saveGameState,
  saveToPersistedState,
  setHighscore,
} from '../utils/stored-state';

import type SettingsService from './settings';

export default class GameService extends Service {
  @service declare settings: SettingsService;

  readonly size = 8;

  @tracked board: Board = generateBoard(this.size);
  @tracked points = 0;
  @tracked moves = 0;
  @tracked loading = true;
  @tracked animating = false;
  @tracked selectedFrom: Position | undefined = undefined;
  @tracked dragPreviewFrom: Position | undefined = undefined;
  @tracked dragPreviewTo: Position | undefined = undefined;
  @tracked dragPreviewX = 0;
  @tracked dragPreviewY = 0;
  @tracked highscore = 0;
  @tracked debug = false;
  @tracked gameOverClosed = false;

  @tracked invalidTileIds: number[] = [];

  private animationToken = 0;
  private invalidToken = 0;

  constructor(owner: unknown) {
    super(owner as never);
    this.highscore = getHighscore();
    this.loadSavedState();
  }

  get gameOver(): boolean {
    return isGameOver(this.board);
  }

  get showGameOver(): boolean {
    return this.gameOver && !this.gameOverClosed;
  }

  closeGameOver(): void {
    this.gameOverClosed = true;
  }

  resetBoard(): void {
    const newBoard = generateBoard(this.size);

    saveGameState(newBoard, 0, 0);

    this.animationToken++;
    this.animating = false;
    this.gameOverClosed = false;
    this.points = 0;
    this.moves = 0;
    this.selectedFrom = undefined;
    this.board = newBoard;
  }

  hint(): void {
    const positions = getPositionsThatAlmostMatch(this.board);

    if (!positions) {
      return;
    }

    void this.swapTiles(positions[0], positions[1]);
  }

  async swapTiles(a: Position, b: Position): Promise<void> {
    if (this.animating) {
      return;
    }

    const beforeBoard = this.board;
    const boards = swapTile(a, b, beforeBoard);

    const isInvalidMove = boards.length === 2;

    if (isInvalidMove) {
      const fromTile = beforeBoard[a.x]?.[a.y];
      const toTile = beforeBoard[b.x]?.[b.y];

      if (fromTile && toTile) {
        this.invalidTileIds = [fromTile.id, toTile.id];

        const clearToken = ++this.invalidToken;

        window.setTimeout(() => {
          if (clearToken === this.invalidToken) {
            this.invalidTileIds = [];
          }
        }, 450);
      }
    }

    // React increments moves on every attempted swap (including invalid swaps)
    this.moves = this.moves + 1;

    const token = ++this.animationToken;

    this.animating = true;

    const durationMs = Math.round(this.settings.animationDurationSeconds * 1000);
    // Even if the user selects "instant", we still need at least a frame or two
    // between board states for movement/cascade animations to be visible.
    const stepDelayMs = Math.max(120, durationMs) + 60;

    for (const [index, step] of boards.entries()) {
      if (token !== this.animationToken) {
        return;
      }

      this.board = step.board;
      this.points = this.points + step.points;

      if (index < boards.length - 1) {
        await sleep(stepDelayMs);
      }
    }

    if (boardContains2048Tile(this.board)) {
      saveToPersistedState({ key: '2048achievement', value: 'true' });
    }

    this.animating = false;
    this.persistProgress();
  }

  clickTile(position: Position): void {
    if (this.animating) {
      return;
    }

    if (!this.selectedFrom) {
      this.selectedFrom = position;

      return;
    }

    if (
      (this.selectedFrom.x === position.x &&
        this.selectedFrom.y === position.y) ||
      !isAdjacent(this.selectedFrom, position)
    ) {
      this.selectedFrom = undefined;

      return;
    }

    const from = this.selectedFrom;

    this.selectedFrom = undefined;
    void this.swapTiles(from, position);
  }

  /**
   * Swipe direction helper for pointer interactions.
   */
  swipeFrom(position: Position, deltaX: number, deltaY: number): void {
    if (this.animating) {
      return;
    }

    const offsetX = Math.abs(deltaX);
    const offsetY = Math.abs(deltaY);

    let swipeToPosition: Position | undefined;

    if (offsetX > offsetY) {
      swipeToPosition =
        deltaX > 0
          ? { x: position.x + 1, y: position.y }
          : { x: position.x - 1, y: position.y };
    } else {
      swipeToPosition =
        deltaY > 0
          ? { x: position.x, y: position.y + 1 }
          : { x: position.x, y: position.y - 1 };
    }

    this.selectedFrom = undefined;

    if (swipeToPosition) {
      void this.swapTiles(position, swipeToPosition);
    }
  }

  updateDragPreview(
    from: Position,
    deltaX: number,
    deltaY: number,
    stepPx: number
  ): void {
    if (this.animating) {
      return;
    }

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    const factor = 0.75;
    const max = Math.max(0, stepPx * factor);

    let to: Position | undefined;
    let previewX = 0;
    let previewY = 0;

    if (absX > absY) {
      to = {
        x: from.x + (deltaX > 0 ? 1 : -1),
        y: from.y,
      };
      previewX = clamp(-deltaX * factor, -max, max);
    } else if (absY > 0) {
      to = {
        x: from.x,
        y: from.y + (deltaY > 0 ? 1 : -1),
      };
      previewY = clamp(-deltaY * factor, -max, max);
    }

    if (!to || !this.isInBounds(to)) {
      this.clearDragPreview();

      return;
    }

    this.dragPreviewFrom = from;
    this.dragPreviewTo = to;
    this.dragPreviewX = previewX;
    this.dragPreviewY = previewY;
  }

  clearDragPreview(): void {
    this.dragPreviewFrom = undefined;
    this.dragPreviewTo = undefined;
    this.dragPreviewX = 0;
    this.dragPreviewY = 0;
  }

  isPreviewTarget(position: Position): boolean {
    const to = this.dragPreviewTo;

    return Boolean(to && to.x === position.x && to.y === position.y);
  }

  getPreviewOffset(position: Position): { x: number; y: number } {
    if (!this.isPreviewTarget(position)) {
      return { x: 0, y: 0 };
    }

    return { x: this.dragPreviewX, y: this.dragPreviewY };
  }

  private isInBounds({ x, y }: Position): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  private loadSavedState(): void {
    const gameState = getGameState();

    if (!gameState || gameState.points === 0) {
      this.loading = false;

      return;
    }

    this.board = gameState.board;
    this.points = gameState.points;
    this.moves = gameState.moves;
    this.loading = false;
  }

  private persistProgress(): void {
    if (this.animating) {
      return;
    }

    saveGameState(this.board, this.points, this.moves);

    if (!this.debug && this.points > this.highscore) {
      setHighscore(this.points);
      this.highscore = this.points;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

declare module '@ember/service' {
  interface Registry {
    game: GameService;
  }
}
