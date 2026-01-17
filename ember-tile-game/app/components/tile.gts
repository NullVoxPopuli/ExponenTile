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
import { getTileDisplayValue } from '../utils/sharing';

import type GameService from '../services/game';

type Args = {
  tile: Tile;
  position: Position;
  selected: boolean;
  durationMs?: number;
};

export default class TileComponent extends Component<Args> {
  @service declare game: GameService;

  @tracked private dragX = 0;
  @tracked private dragY = 0;
  @tracked private isDragging = false;

  private pointerStart:
    | {
        id: number;
        x: number;
        y: number;
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

      if (maxDistance > 0) {
        // Use the service-selected gravity duration as the upper bound
        // (so step timing is long enough), but make smaller drops quicker.
        // Keep a relatively high floor so gravity is readable.
        const min = Math.max(300, Math.round(baseDuration * 0.6));
        const distanceFactor = Math.min(1, distance / maxDistance);

        duration = Math.round(min + (baseDuration - min) * distanceFactor);
      }
    }

    return `--pos-x:${this.args.position.x};--pos-y:${this.args.position.y};--spawn-from-y:${spawnFromY};--merge-x:${mergeX};--merge-y:${mergeY};--preview-x:${previewX}px;--preview-y:${previewY}px;--drag-x:${x}px;--drag-y:${y}px;--move-duration:${duration}ms;--move-delay:${delay}ms;`;
  }

  get wrapperClass(): string {
    const dragging = this.isDragging ? ' tile-wrap-dragging' : '';
    const merging =
      this.args.tile.removed && this.game.mergePhase === 'collapse'
        ? ' tile-wrap-merging'
        : '';

    // Multi-step vertical moves are gravity/cascade. Add a class so CSS can
    // make them feel more obvious than 1-step swaps.
    const distance = this.game.moveDistanceByTileId[this.args.tile.id] ?? 0;
    const falling = !this.isDragging && distance > 1 ? ' tile-wrap-falling' : '';

    return `tile-wrap${dragging}${merging}${falling}`;
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

    this.pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    this.game.clearDragPreview();

    (event.currentTarget as HTMLElement | null)?.setPointerCapture(
      event.pointerId
    );
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
    // Only drag in one axis (feels like the original).

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.dragX = clamp(deltaX, -step, step);
      this.dragY = 0;

      this.game.updateDragPreview(this.args.position, this.dragX, 0, step);

      return;
    }

    this.dragX = 0;
    this.dragY = clamp(deltaY, -step, step);
    this.game.updateDragPreview(this.args.position, 0, this.dragY, step);
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

    this.pointerStart = undefined;
    this.isDragging = false;
    this.dragX = 0;
    this.dragY = 0;
    this.game.clearDragPreview();
  }

  @action
  pointerCancel(): void {
    this.pointerStart = undefined;
    this.isDragging = false;
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
    >
      <div
        role="button"
        tabindex="0"
        class={{this.classes}}
        style={{this.style}}
        {{bumpOnChange @tile.value}}
        {{on "keydown" this.keydown}}
        {{on "pointerdown" this.pointerDown}}
        {{on "pointermove" this.pointerMove}}
        {{on "pointerup" this.pointerUp}}
        {{on "pointercancel" this.pointerCancel}}
      >
        {{this.displayValue}}
      </div>
    </div>
  </template>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function maxDistanceFromMap(distanceByTileId: Record<number, number>): number {
  let max = 0;

  for (const value of Object.values(distanceByTileId)) {
    max = Math.max(max, value);
  }

  return max;
}

function getTileStepPx(): number {
  const tileSize = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--tile-size')
  );
  const tileGap = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--tile-gap')
  );

  // Fallbacks if CSS vars are missing.
  const safeTileSize = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 56;
  const safeTileGap = Number.isFinite(tileGap) && tileGap >= 0 ? tileGap : 6;

  return safeTileSize + safeTileGap;
}
