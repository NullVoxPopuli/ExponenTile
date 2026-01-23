import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { action } from '@ember/object';

import { finishedTutorial, isTutorialDone } from '../utils/stored-state';

export default class TutorialModal extends Component {
  @tracked open = !isTutorialDone();
  @tracked step = 0;

  get isStep0(): boolean {
    return this.step === 0;
  }

  get isStep1(): boolean {
    return this.step === 1;
  }

  @action
  next(): void {
    this.step = 1;
  }

  @action
  close(): void {
    this.open = false;
    finishedTutorial();
  }

  <template>
    {{#if this.open}}
      <div class="modal-layer">
        <button
          type="button"
          class="modal-backdrop"
          {{on "click" this.close}}
          aria-label="Close"
        ></button>
        <div class="modal tutorial" role="dialog" aria-modal="true">
          {{#if this.isStep0}}
            <p class="tutorial-text">
              Swap tiles to make a combination of three or more identical tiles.
            </p>
            <button
              type="button"
              class="btn btn-full"
              {{on "click" this.next}}
            >Next</button>
          {{/if}}

          {{#if this.isStep1}}
            <p class="tutorial-text">
              The more tiles in the match, the higher the resulting tile will
              be.
            </p>
            <button
              type="button"
              class="btn btn-full"
              {{on "click" this.close}}
            >Close</button>
          {{/if}}
        </div>
      </div>
    {{/if}}
  </template>
}
