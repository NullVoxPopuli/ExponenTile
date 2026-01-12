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
  @tracked highscore = 0;
  @tracked debug = false;
  @tracked gameOverClosed = false;

  private animationToken = 0;

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

    const boards = swapTile(a, b, this.board);

    // React increments moves on every attempted swap (including invalid swaps)
    this.moves = this.moves + 1;

    const token = ++this.animationToken;

    this.animating = true;

    const durationSeconds = this.settings.animationDurationSeconds;

    for (const [index, step] of boards.entries()) {
      if (token !== this.animationToken) {
        return;
      }

      this.board = step.board;
      this.points = this.points + step.points;

      if (index < boards.length - 1 && durationSeconds > 0) {
        await sleep(durationSeconds * 1000 + 100);
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

declare module '@ember/service' {
  interface Registry {
    game: GameService;
  }
}
