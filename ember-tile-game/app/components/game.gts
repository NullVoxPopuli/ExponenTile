import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

import config from 'ember-tile-game/config/environment';

import ShareButton from '#components/share-button';
import TileComponent from '#components/tile';
import TutorialModal from '#components/tutorial-modal';
import onWindow from '#modifiers/on-window';

import { encodeStateInURL } from '../utils/sharing';

import type { Board, Position, Tile } from '../game/board';
import type GameService from '../services/game';

type RowCell = { key: number; tile: Tile; position: Position; selected: boolean };

function withRootURL(rootURL: string, path: string): string {
  let base = rootURL || '/';

  if (!base.startsWith('/')) {
    base = `/${base}`;
  }

  if (!base.endsWith('/')) {
    base = `${base}/`;
  }

  const child = path.startsWith('/') ? path.slice(1) : path;

  return `${base}${child}`;
}

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

  get shellClass(): string {
    return 'game-shell';
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
          key: tileAt(board, position).id,
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

    url.pathname = withRootURL(config.rootURL, 'shared');
    url.search = encodeStateInURL(this.game.board, this.game.points);

    return url.toString();
  }

  get randomizeCost(): number {
    return Math.floor(this.game.points / 4);
  }

  get showRandomizeCount(): boolean {
    return this.game.randomizeCount > 0;
  }

  @action
  newGame(): void {
    this.game.resetBoard();
  }

  @action
  hint(): void {
    this.game.hint();
  }

  @action
  handleKeyDown(event: Event): void {
    // Secret hotkey: Ctrl+J to auto-swap tiles
    if (event instanceof KeyboardEvent && event.ctrlKey && event.key === 'j') {
      event.preventDefault();
      this.game.autoSwap();
    }

    // Secret hotkey: Ctrl+K to auto-play until game over
    if (event instanceof KeyboardEvent && event.ctrlKey && event.key === 'k') {
      event.preventDefault();
      void this.game.autoPlayToGameOver();
    }
  }

  <template>
    <div class="app-shell" {{onWindow "keydown" this.handleKeyDown}}>
      <TutorialModal />

      <div class={{this.shellClass}} style={{this.shellStyle}}>
        <div class="board">
          {{#each this.cells key="key" as |cell|}}
            <TileComponent
              @tile={{cell.tile}}
              @position={{cell.position}}
              @selected={{cell.selected}}
              @durationMs={{this.animationDurationMs}}
              @spawnRowsByTileId={{this.game.spawnRowsByTileId}}
            />
          {{/each}}
        </div>

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
              {{#if this.showRandomizeCount}}
                <div class="hud-score">
                  <div class="hud-label">Randomizations Used</div>
                  <div class="hud-value">{{this.game.randomizeCount}}</div>
                </div>
              {{/if}}
            </div>

            <div class="hud-actions">
              {{#if this.game.gameOver}}
                <div class="hud-status" role="status">Game over</div>
              {{/if}}

              {{#unless this.game.gameOver}}
                <button
                  type="button"
                  class="btn"
                  {{on "click" this.hint}}
                  disabled={{this.game.animating}}
                >
                  Hint
                </button>
              {{/unless}}

              <button
                type="button"
                class={{if this.game.gameOver "btn btn-primary" "btn"}}
                {{on "click" this.newGame}}
              >
                New Game
              </button>

              {{#if this.showRandomizeCount}}
                <button
                  type="button"
                  class="btn"
                  {{on "click" this.game.randomizeTiles}}
                  disabled={{this.game.animating}}
                >
                  Randomize (-{{this.randomizeCost}} points)
                </button>
              {{/if}}
            </div>
          </div>


        </div>

        {{#if this.game.showGameOver}}
          <div class="modal-layer modal-layer-top">
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
                  {{on "click" this.game.closeGameOver}}
                >Admire game board</button>

                <button
                  type="button"
                  class="btn"
                  {{on "click" this.game.randomizeTiles}}
                >Randomize Tiles (-{{this.randomizeCost}} points)</button>

                <hr class="modal-separator" />

                <button
                  type="button"
                  class="btn btn-primary"
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
    const groupPulseDuration = Math.round(260 * this.game.animationSpeedMultiplier);
    const mergeBumpDuration = Math.round(140 * this.game.animationSpeedMultiplier);

    return `--board-size:${size};--move-duration:${this.animationDurationMs}ms;--move-ease:${this.game.moveEasing};--group-pulse-duration:${groupPulseDuration}ms;--merge-bump-duration:${mergeBumpDuration}ms;`;
  }

  get shellStyle(): string {
    return this.boardStyle;
  }

  get animationDurationMs(): number {
    return this.game.moveDurationMs;
  }
}
