import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

import {
  type AnimationSpeed,
  AnimationSpeeds,
  type GamePosition,
  GamePositions,
} from '../services/settings';

import type GameService from '../services/game';
import type SettingsService from '../services/settings';

export default class SettingsPanel extends Component {
  @service declare settings: SettingsService;
  @service declare game: GameService;

  @tracked open = false;
  @tracked private pressed: string[] = [];

  @action
  toggle(): void {
    this.open = !this.open;
  }

  @action
  close(): void {
    this.open = false;
  }

  private recordPress(value: string): void {
    this.pressed = [...this.pressed, value].slice(-5);

    const sequence = ['bottom', 'top', 'slow', 'fast', 'instant'];

    if (
      this.pressed.length === sequence.length &&
      this.pressed.every((v, i) => v === sequence[i])
    ) {
      this.game.debug = true;
    }
  }

  @action
  setSpeed(speed: AnimationSpeed): void {
    this.settings.setAnimationSpeed(speed);
    this.recordPress(speed);
  }

  @action
  setPosition(position: GamePosition): void {
    this.settings.setGamePosition(position);
    this.recordPress(position);
  }

  <template>
    <button
      type="button"
      class="icon-btn"
      {{on "click" this.toggle}}
      aria-label="Settings"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>

    {{#if this.open}}
      <div class="modal-layer">
        <button
          type="button"
          class="modal-backdrop"
          {{on "click" this.close}}
          aria-label="Close"
        ></button>
        <div class="sheet" role="dialog" aria-modal="true">
          <div class="sheet-header">
            <h2 class="sheet-title">Settings</h2>
            <button
              type="button"
              class="icon-btn"
              {{on "click" this.close}}
              aria-label="Close"
            >×</button>
          </div>

          <div class="sheet-section">
            <h3 class="sheet-label">Animation speed</h3>
            <div class="radio-list">
              {{#each-in AnimationSpeeds as |speed|}}
                <button
                  type="button"
                  class={{this.speedButtonClass speed}}
                  {{on "click" (fn this.setSpeed speed)}}
                >
                  {{speed}}
                </button>
              {{/each-in}}
            </div>
          </div>

          <div class="sheet-section">
            <h3 class="sheet-label">Game position</h3>
            <div class="radio-list">
              {{#each GamePositions as |pos|}}
                <button
                  type="button"
                  class={{this.positionButtonClass pos}}
                  {{on "click" (fn this.setPosition pos)}}
                >
                  {{pos}}
                </button>
              {{/each}}
            </div>
          </div>

          <button
            type="button"
            class="btn btn-full"
            {{on "click" this.close}}
          >Close</button>
        </div>
      </div>
    {{/if}}
  </template>

  get AnimationSpeeds() {
    return AnimationSpeeds;
  }

  get GamePositions() {
    return GamePositions;
  }

  isSpeedSelected(speed: string): boolean {
    return this.settings.animationSpeed === speed;
  }

  speedButtonClass(speed: string): string {
    return `radio${this.isSpeedSelected(speed) ? ' radio-selected' : ''}`;
  }

  isPositionSelected(position: string): boolean {
    return this.settings.gamePosition === position;
  }

  positionButtonClass(position: string): string {
    return `radio${this.isPositionSelected(position) ? ' radio-selected' : ''}`;
  }
}
