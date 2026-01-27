import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

import {
  getContrastTextColor,
  getTileColor,
  type Position,
  type Tile,
} from '../game/board';
import bumpOnChange from '../modifiers/bump-on-change';
import spawn from '../modifiers/spawn';
import persistentPointer from '../modifiers/persistent-pointer';
import onWindow from '../modifiers/on-window';
import { getTileDisplayValue } from '../utils/sharing';

import type GameService from '../services/game';

type Args = {
  tile: Tile;
  position: Position;
  selected: boolean;
  durationMs?: number;
  spawnRowsByTileId?: Record<number, number>;
};

export default class TileComponent extends Component<Args> {
  @service declare game: GameService;

  @tracked private dragX = 0;
  @tracked private dragY = 0;
  @tracked private isDragging = false;
  @tracked private isOscillating = false;
  @tracked private oscillationValue = 0;

  // Keep cleanup handy so we always remove listeners/capture
  private cleanupCaptureListener: (() => void) | undefined;
  private oscillationAnimationId: number | undefined;

  private pointerStart:
    | {
        id: number;
        x: number;
        y: number;
        captureElement: HTMLElement;
        timestamp: number;
      }
    | undefined;

  get style(): string {
    const color = getTileColor(this.args.tile);
    const textColor = getContrastTextColor(color);

    return `background:${color};color:${textColor};`;
  }

  get wrapperStyle(): string {
    const x = this.dragX;
    const y = this.dragY;
    const { x: previewX, y: previewY } = this.game.getPreviewOffset(
      this.args.position
    );

    const mergePhase = this.game.mergePhase;
    const mergeX =
      mergePhase === 'collapse' && this.args.tile.removed
        ? this.args.tile.mergedTo.x - this.args.position.x
        : 0;
    const mergeY =
      mergePhase === 'collapse' && this.args.tile.removed
        ? this.args.tile.mergedTo.y - this.args.position.y
        : 0;

    const spawnRows = this.game.spawnRowsByTileId[this.args.tile.id] ?? 0;
    const spawnFromY = spawnRows > 0 ? -spawnRows : 0;

    const baseDuration = this.isDragging
      ? 0
      : this.game.isPreviewTarget(this.args.position)
        ? 60
        : Math.max(120, this.args.durationMs ?? 0);

    let duration = baseDuration;

    const delay = this.isDragging
      ? 0
      : this.game.isPreviewTarget(this.args.position)
        ? 0
        : this.game.moveDelayByTileId[this.args.tile.id] ?? 0;

    if (!this.isDragging) {
      const maxDistance = maxDistanceFromMap(this.game.moveDistanceByTileId);
      const distance = this.game.moveDistanceByTileId[this.args.tile.id] ?? 0;

      if (maxDistance > 0 && distance > 0) {
        // Longer falls should have longer durations so they're readable.
        // Use baseDuration (from service) as the max duration for longest falls.
        // Use a floor of 300ms minimum so even short falls are visible.
        const min = 300;
        const max = Math.max(min, baseDuration);
        const distanceFactor = Math.min(1, distance / maxDistance);

        duration = Math.round(min + (max - min) * distanceFactor);
      }
    }

    return `--pos-x:${this.args.position.x};--pos-y:${this.args.position.y};--spawn-from-y:${spawnFromY};--merge-x:${mergeX};--merge-y:${mergeY};--preview-x:${previewX}px;--preview-y:${previewY}px;--drag-x:${x}px;--drag-y:${y}px;--move-ease:${this.game.moveEasing};--move-duration:${duration}ms;--move-delay:${delay}ms;`;

  }

  get wrapperClass(): string {
    const dragging = this.isDragging ? ' tile-wrap-dragging' : '';
    const oscillating = this.isOscillating ? ' tile-wrap-oscillating' : '';
    const merging =
      this.args.tile.removed && this.game.mergePhase === 'collapse'
        ? ' tile-wrap-merging'
        : '';

    // Multi-step vertical moves are gravity/cascade. Add a class so CSS can
    // make them feel more obvious than 1-step swaps.
    const distance = this.game.moveDistanceByTileId[this.args.tile.id] ?? 0;
    const falling = !this.isDragging && distance > 1 ? ' tile-wrap-falling' : '';

    // Spawning tiles are placed on top
    const spawnRows = this.game.spawnRowsByTileId[this.args.tile.id] ?? 0;
    const spawning = spawnRows > 0 ? ' tile-wrap-spawning' : '';

    // Check if this tile is being replaced by a spawning tile at the same position
    // If it is, hide it so the spawning animation looks clean
    let hidden = '';

    if (spawnRows === 0 && this.args.spawnRowsByTileId) {
      // Check if any OTHER tile is spawning at this position

      for (const [idString, rows] of Object.entries(this.args.spawnRowsByTileId)) {
        if (rows > 0) {
          const otherId = Number(idString);
          const otherTile = this.game.board[this.args.position.x]?.[this.args.position.y];
          // If there's a spawning tile at this position and it's not us, hide

          if (otherTile?.id === otherId && otherTile.id !== this.args.tile.id) {
            hidden = ' tile-wrap-hidden';

            break;
          }
        }
      }
    }

    return `tile-wrap${dragging}${oscillating}${merging}${falling}${spawning}${hidden}`;
  }

  get classes(): string {
    const selected = this.args.selected ? ' tile-selected' : '';
    const removed =
      this.args.tile.removed && this.game.mergePhase === 'none'
        ? ' tile-removed'
        : '';
    const mergeOut =
      this.args.tile.removed && this.game.mergePhase === 'collapse'
        ? ' tile-merge-out'
        : '';
    const group = this.game.isMergeGroupTile(this.args.tile, this.args.position)
      ? ' tile-group'
      : '';
    const groupHighlight =
      this.game.mergePhase === 'highlight' &&
      this.game.isMergeGroupTile(this.args.tile, this.args.position)
        ? ' tile-group-highlight'
        : '';
    const target = this.game.isMergeTarget(this.args.position)
      ? ' tile-merge-target'
      : '';
    const invalid = this.game.invalidTileIds.includes(this.args.tile.id)
      ? ' tile-invalid'
      : '';

    const hint = this.game.hintTileIds.includes(this.args.tile.id)
      ? ' tile-hint'
      : '';

    return `tile${selected}${removed}${mergeOut}${group}${groupHighlight}${target}${invalid}${hint}`;
  }

  get displayValue(): number {
    return getTileDisplayValue(this.args.tile);
  }

  @action
  click(): void {
    this.game.clickTile(this.args.position);
  }

  @action
  pointerDown(event: PointerEvent): void {
    if (this.game.animating) {
      return;
    }

    event.preventDefault();

    this.isDragging = true;

    const element = event.currentTarget as HTMLElement;
    const captureElement = element.parentElement as HTMLElement;

    if (!captureElement) {
      return;
    }

    this.pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      captureElement,
      timestamp: performance.now(),
    };
    this.game.clearDragPreview();

    // Guard in case the element hierarchy is different than expected
    if (!captureElement) {
      return;
    }

    const onLostPointerCapture = (lostEvent: PointerEvent): void => {
      if (this.pointerStart && lostEvent.pointerId === this.pointerStart.id) {
        this.pointerCancel();
      }
    };

    // Track cleanup so we don't leak listeners
    captureElement.addEventListener('lostpointercapture', onLostPointerCapture);

    this.cleanupCaptureListener = () => {
      captureElement.removeEventListener('lostpointercapture', onLostPointerCapture);
    };

    captureElement.setPointerCapture(event.pointerId);
  }

  @action
  pointerMove(event: PointerEvent): void {
    const start = this.pointerStart;

    if (!start || start.id !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    const step = getTileStepPx();
    const boardSize = this.game.board.length;

    // Only drag in one axis (feels like the original).
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Allow one tile drag, but respect board boundaries
      const tilesLeftAvailable = this.args.position.x;
      const tilesRightAvailable = boardSize - this.args.position.x - 1;
      const maxLeftDrag = Math.min(tilesLeftAvailable, 1) * step;
      const maxRightDrag = Math.min(tilesRightAvailable, 1) * step;
      const clampedDeltaX = Math.max(-maxLeftDrag, Math.min(maxRightDrag, deltaX));

      // Add oscillation when at limit
      const isAtLimit = Math.abs(clampedDeltaX) >= Math.max(maxLeftDrag, maxRightDrag);

      if (isAtLimit && !this.isOscillating) {
        this.isOscillating = true;
        this.startOscillationLoop();
      } else if (!isAtLimit && this.isOscillating) {
        this.isOscillating = false;
        this.stopOscillationLoop();
      }

      this.dragX = clampedDeltaX + this.oscillationValue;
      this.dragY = 0;

      this.game.updateDragPreview(this.args.position, clampedDeltaX, 0, step);

      return;
    }

    // Allow one tile drag, but respect board boundaries
    const tilesUpAvailable = this.args.position.y;
    const tilesDownAvailable = boardSize - this.args.position.y - 1;
    const maxUpDrag = Math.min(tilesUpAvailable, 1) * step;
    const maxDownDrag = Math.min(tilesDownAvailable, 1) * step;
    const clampedDeltaY = Math.max(-maxUpDrag, Math.min(maxDownDrag, deltaY));

    // Add oscillation when at limit
    const isAtLimit = Math.abs(clampedDeltaY) >= Math.max(maxUpDrag, maxDownDrag);

    if (isAtLimit && !this.isOscillating) {
      this.isOscillating = true;
      this.startOscillationLoop();
    } else if (!isAtLimit && this.isOscillating) {
      this.isOscillating = false;
      this.stopOscillationLoop();
    }

    this.dragX = 0;
    this.dragY = clampedDeltaY + this.oscillationValue;
    this.game.updateDragPreview(this.args.position, 0, clampedDeltaY, step);
  }

  @action
  pointerUp(event: PointerEvent): void {
    const start = this.pointerStart;

    if (!start || start.id !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    const threshold = 14;

    if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      // treat as click
      this.click();
    } else {
      this.dragX = 0;
      this.dragY = 0;
      this.game.swipeFrom(this.args.position, deltaX, deltaY);
    }

    try {
      start.captureElement.releasePointerCapture(event.pointerId);
    } catch {
      // capture may already be released; ignore
    }

    this.cleanupCaptureListener?.();
    this.cleanupCaptureListener = undefined;

    this.pointerStart = undefined;
    this.isDragging = false;
    this.isOscillating = false;
    this.oscillationValue = 0;
    this.dragX = 0;
    this.dragY = 0;
    this.game.clearDragPreview();

    this.stopOscillationLoop();
  }

  // Window-level handlers bridge Event to PointerEvent to satisfy typing
  @action
  pointerUpFromWindow(event: Event): void {
    if (event instanceof PointerEvent) {
      this.pointerUp(event);
    }
  }

  @action
  pointerCancelFromWindow(event: Event): void {
    if (event instanceof PointerEvent) {
      this.pointerCancel();
    } else {
      this.pointerCancel();
    }
  }

  private startOscillationLoop(): void {
    if (this.oscillationAnimationId) {
      return; // Already running
    }

    const startTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.isOscillating) {
        return; // Stop loop if oscillating is false
      }

      const elapsed = currentTime - startTime;
      const period = 500; // milliseconds
      const amplitude = 2; // pixels
      const phase = (elapsed % period) / period * Math.PI * 2;

      this.oscillationValue = Math.sin(phase) * amplitude;

      this.oscillationAnimationId = requestAnimationFrame(loop);
    };

    this.oscillationAnimationId = requestAnimationFrame(loop);
  }

  private stopOscillationLoop(): void {
    if (this.oscillationAnimationId) {
      cancelAnimationFrame(this.oscillationAnimationId);
      this.oscillationAnimationId = undefined;
    }

    this.oscillationValue = 0;
  }

  @action
  pointerCancel(): void {
    const start = this.pointerStart;

    if (start) {
      try {
        start.captureElement.releasePointerCapture(start.id);
      } catch {
        // capture may already be released; ignore
      }
    }

    this.cleanupCaptureListener?.();
    this.cleanupCaptureListener = undefined;

    this.stopOscillationLoop();

    this.pointerStart = undefined;
    this.isDragging = false;
    this.isOscillating = false;
    this.dragX = 0;
    this.dragY = 0;
    this.game.clearDragPreview();
  }

  @action
  keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.click();
    }
  }

  <template>
    {{! template-lint-disable no-pointer-down-event-binding }}
    <div
      class={{this.wrapperClass}}
      style={{this.wrapperStyle}}
      {{spawn}}
      {{persistentPointer this.pointerMove this.pointerUp this.pointerCancel}}
      {{onWindow "pointerup" this.pointerUpFromWindow}}
      {{onWindow "pointercancel" this.pointerCancelFromWindow}}
      {{onWindow "blur" this.pointerCancelFromWindow}}
    >
      <div
        role="button"
        tabindex="0"
        class={{this.classes}}
        style={{this.style}}
        {{bumpOnChange @tile.value}}
        {{on "keydown" this.keydown}}
        {{on "pointerdown" this.pointerDown}}
      >
        {{this.displayValue}}
      </div>
    </div>
  </template>
}

function maxDistanceFromMap(distanceByTileId: Record<number, number>): number {
  let max = 0;

  for (const value of Object.values(distanceByTileId)) {
    max = Math.max(max, value);
  }

  return max;
}

function getTileStepPx(): number {
  // Prefer the live board step (accounts for responsive clamps) so drag distance
  // matches the rendered grid exactly. Fallback to tile size + gap.
  const board = document.querySelector('.board');
  const boardStyle = getComputedStyle(board ?? document.documentElement);

  const boardStep = parseFloat(boardStyle.getPropertyValue('--board-step'));

  if (Number.isFinite(boardStep) && boardStep > 0) {
    return boardStep;
  }

  const tileSize = parseFloat(boardStyle.getPropertyValue('--tile-size'));
  const tileGap = parseFloat(boardStyle.getPropertyValue('--tile-gap'));

  const safeTileSize = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 56;
  const safeTileGap = Number.isFinite(tileGap) && tileGap >= 0 ? tileGap : 6;

  return safeTileSize + safeTileGap;
}
