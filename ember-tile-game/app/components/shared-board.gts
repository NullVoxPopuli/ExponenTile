import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';

import { decodeStateFromURL } from '../utils/sharing';
import SvgGrid from './svg-grid';

import type { Board } from '../game/board';

export default class SharedBoard extends Component {
  @cached
  get decoded(): { board: Board; points: number } | undefined {
    return decodeStateFromURL(window.location.search);
  }

  get board(): Board | undefined {
    return this.decoded?.board;
  }

  <template>
    <div class="shared">
      {{#if this.board}}
        <SvgGrid @board={{this.board}} />
      {{else}}
        <p>Nothing to show.</p>
      {{/if}}
    </div>
  </template>
}
