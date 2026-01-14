import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

import { encodeStateInURL } from '../utils/sharing';
import SettingsPanel from './settings-panel';
import ShareButton from './share-button';
import TileComponent from './tile';
import TutorialModal from './tutorial-modal';

import type { Board, Position, Tile } from '../game/board';
import type GameService from '../services/game';
import type SettingsService from '../services/settings';

type RowCell = { tile: Tile; position: Position; selected: boolean };

function tileAt(board: Board, { x, y }: Position): Tile {
  const column = board[x];

  if (!column) {
    throw new Error(`Board column out of bounds: x=${x}`);
  }

  const tile = column[y];

  if (!tile) {
    throw new Error(`Board cell out of bounds: x=${x} y=${y}`);
  }

  return tile;
}

export default class GameComponent extends Component {
  @service declare game: GameService;
  @service declare settings: SettingsService;

  get isTop(): boolean {
    return this.settings.gamePosition === 'top';
  }

  get isBottom(): boolean {
    return this.settings.gamePosition === 'bottom';
  }

  get shellClass(): string {
    return `game-shell${this.isBottom ? ' game-shell-bottom' : ''}`;
  }

  @cached
  get cells(): RowCell[] {
    const board = this.game.board;
    const size = board.length;
    const selectedFrom = this.game.selectedFrom;

    const cells: RowCell[] = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const position = { x, y };

        cells.push({
          tile: tileAt(board, position),
          position,
          selected: Boolean(
            selectedFrom && selectedFrom.x === x && selectedFrom.y === y
          ),
        });
      }
    }

    return cells;
  }

  get displayHighscore(): number {
    return Math.max(this.game.highscore, this.game.points);
  }

  get shareUrl(): string {
    const url = new URL(window.location.href);

    url.pathname = '/shared';
    url.search = encodeStateInURL(this.game.board, this.game.points);

    return url.toString();
  }

  @action
  newGame(): void {
    this.game.resetBoard();
  }

  @action
  hint(): void {
    this.game.hint();
  }

  <template>
    <div class="app-shell">
      <TutorialModal />

      <div class={{this.shellClass}}>
        {{#if this.isTop}}
          <div class="hud">
            <div class="hud-row">
              <div class="hud-scores">
                <div class="hud-score">
                  <div class="hud-label">Score</div>
                  <div class="hud-value">{{this.game.points}}</div>
                </div>
                <div class="hud-score">
                  <div class="hud-label">Highscore</div>
                  <div class="hud-value">{{this.displayHighscore}}</div>
                </div>
                <div class="hud-score">
                  <div class="hud-label">Moves</div>
                  <div class="hud-value">{{this.game.moves}}</div>
                </div>
              </div>

              <div class="hud-actions">
                <button
                  type="button"
                  class="btn"
                  {{on "click" this.hint}}
                  disabled={{this.game.animating}}
                >
                  Hint
                </button>
                <button type="button" class="btn" {{on "click" this.newGame}}>
                  New Game
                </button>
                <SettingsPanel />
              </div>
            </div>
          </div>
        {{/if}}

        <div class="board" style={{this.boardStyle}}>
          {{#each this.cells key="tile.id" as |cell|}}
            <TileComponent
              @tile={{cell.tile}}
              @position={{cell.position}}
              @selected={{cell.selected}}
              @durationMs={{this.animationDurationMs}}
            />
          {{/each}}
        </div>

        {{#if this.isBottom}}
          <div class="hud">
            <div class="hud-row">
              <div class="hud-scores">
                <div class="hud-score">
                  <div class="hud-label">Score</div>
                  <div class="hud-value">{{this.game.points}}</div>
                </div>
                <div class="hud-score">
                  <div class="hud-label">Highscore</div>
                  <div class="hud-value">{{this.displayHighscore}}</div>
                </div>
                <div class="hud-score">
                  <div class="hud-label">Moves</div>
                  <div class="hud-value">{{this.game.moves}}</div>
                </div>
              </div>

              <div class="hud-actions">
                <button
                  type="button"
                  class="btn"
                  {{on "click" this.hint}}
                  disabled={{this.game.animating}}
                >
                  Hint
                </button>
                <button type="button" class="btn" {{on "click" this.newGame}}>
                  New Game
                </button>
                <SettingsPanel />
              </div>
            </div>
          </div>
        {{/if}}

        {{#if this.game.showGameOver}}
          <div class="modal-layer">
            <button
              type="button"
              class="modal-backdrop"
              {{on "click" this.game.closeGameOver}}
              aria-label="Close"
            ></button>
            <div class="modal" role="dialog" aria-modal="true">
              <h2 class="modal-title">Game over</h2>
              <p class="modal-text">Moves: {{this.game.moves}}</p>

              <div class="modal-actions">
                <ShareButton
                  @board={{this.game.board}}
                  @moves={{this.game.moves}}
                  @points={{this.game.points}}
                />
                <button
                  type="button"
                  class="btn"
                  {{on "click" this.newGame}}
                >New Game</button>
                <a
                  class="btn btn-link"
                  href={{this.shareUrl}}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Shared board link
                </a>
              </div>
            </div>
          </div>
        {{/if}}
      </div>
    </div>
  </template>

  // computed styles
  get boardStyle(): string {
    const size = this.game.board.length;
    const tileSize = getRootCSSPxVar('--tile-size', 56);
    const tileGap = getRootCSSPxVar('--tile-gap', 6);
    const step = tileSize + tileGap;
    const boardPx = size * step - tileGap;

    return `--board-size:${size};--move-duration:${this.animationDurationMs}ms;--board-px:${boardPx}px;`;
  }

  get animationDurationMs(): number {
    return Math.max(
      120,
      Math.round(this.settings.animationDurationSeconds * 1000)
    );
  }
}

function getRootCSSPxVar(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = parseFloat(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
