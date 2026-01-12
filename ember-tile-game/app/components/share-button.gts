import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

import { drawBoardToPNG } from '../utils/sharing';

import type { Board } from '../game/board';

type Args = {
  board: Board;
  moves: number;
  points: number;
};

export default class ShareButton extends Component<Args> {
  @tracked status: string | undefined;

  get canShare(): boolean {
    return 'share' in navigator || 'clipboard' in navigator;
  }

  share = async (): Promise<void> => {
    this.status = undefined;

    // Sharing and clipboard only works on https and localhost.
    const canUseShare = 'share' in navigator;
    const canShareClipboard = 'clipboard' in navigator;

    try {
      if (canUseShare) {
        const file = await drawBoardToPNG(
          this.args.board,
          this.args.moves,
          this.args.points
        );

        await navigator.share({ files: [file] });

        return;
      }

      if (canShareClipboard && navigator.clipboard) {
        // Safari requires clipboard.write to happen directly in response to user interaction.
        const clipboardItem = new ClipboardItem({
          'image/png': drawBoardToPNG(
            this.args.board,
            this.args.moves,
            this.args.points
          ).then((file) => new Blob([file], { type: 'image/png' })),
        });

        await navigator.clipboard.write([clipboardItem]);
        this.status = 'Copied image to clipboard!';
      }
    } catch (e) {
      console.error(e);
      this.status = 'Sharing failed.';
    }
  };

  <template>
    {{#if this.canShare}}
      <div class="share">
        <button type="button" class="btn" {{on "click" this.share}}>
          Share
        </button>
        {{#if this.status}}
          <span class="share-status">{{this.status}}</span>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
