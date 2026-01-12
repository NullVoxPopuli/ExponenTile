import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

import {
  getContrastTextColor,
  getTileColor,
  type Position,
  type Tile,
} from '../game/board';
import { getTileDisplayValue } from '../utils/sharing';

import type GameService from '../services/game';

type Args = {
  tile: Tile;
  position: Position;
  selected: boolean;
};

export default class TileComponent extends Component<Args> {
  @service declare game: GameService;

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

  get classes(): string {
    return `tile${this.args.selected ? ' tile-selected' : ''}`;
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
    this.pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
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
      this.game.swipeFrom(this.args.position, deltaX, deltaY);
    }

    this.pointerStart = undefined;
  }

  @action
  pointerCancel(): void {
    this.pointerStart = undefined;
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
      role="button"
      tabindex="0"
      class={{this.classes}}
      style={{this.style}}
      {{on "keydown" this.keydown}}
      {{on "pointerdown" this.pointerDown}}
      {{on "pointerup" this.pointerUp}}
      {{on "pointercancel" this.pointerCancel}}
    >
      {{this.displayValue}}
    </div>
  </template>
}
