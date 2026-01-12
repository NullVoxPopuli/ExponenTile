import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';

import {
  type Board,
  getContrastTextColor,
  getTileColor,
  type Tile,
} from '../game/board';

function tileAt(board: Board, x: number, y: number): Tile {
  const tile = board[x]?.[y];

  if (!tile) {
    throw new Error(`Board cell out of bounds: x=${x} y=${y}`);
  }

  return tile;
}

type Args = {
  board: Board;
};

type Cell = {
  key: number;
  x: number;
  y: number;
  xPos: number;
  yPos: number;
  xCenter: number;
  yCenter: number;
  value: number;
  color: string;
  textColor: string;
  glow: boolean;
  rectClass: string;
  rectStyle: string;
  textStyle: string;
};

export default class SvgGrid extends Component<Args> {
  tileSize = 44;
  padding = 2;

  @cached
  get size(): number {
    return this.args.board.length;
  }

  @cached
  get dimension(): number {
    return this.size * (this.tileSize + this.padding);
  }

  @cached
  get viewBox(): string {
    return `0 0 ${this.dimension} ${this.dimension}`;
  }

  @cached
  get cells(): Cell[] {
    const cells: Cell[] = [];

    // Render in row-major for display
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const tile = tileAt(this.args.board, x, y);
        const xPos = x * (this.tileSize + this.padding);
        const yPos = y * (this.tileSize + this.padding);
        const color = getTileColor(tile);

        const textColor = getContrastTextColor(color);

        const xCenter = xPos + this.tileSize / 2;
        const yCenter = yPos + this.tileSize / 2;
        const glow = tile.value > 9;

        cells.push({
          key: tile.id,
          x,
          y,
          xPos,
          yPos,
          xCenter,
          yCenter,
          value: Math.pow(2, tile.value),
          color,
          textColor,
          glow,
          rectClass: glow
            ? 'svg-grid__tile svg-grid__tile--glow'
            : 'svg-grid__tile',
          rectStyle: `fill:${color};`,
          textStyle: `fill:${textColor};font-weight:bold;font-size:14px;`,
        });
      }
    }

    return cells;
  }

  <template>
    <svg
      class="svg-grid"
      xmlns="http://www.w3.org/2000/svg"
      width={{this.dimension}}
      height={{this.dimension}}
      viewBox={{this.viewBox}}
    >
      {{#each this.cells key="key" as |cell|}}
        <g>
          <rect
            x={{cell.xPos}}
            y={{cell.yPos}}
            width={{this.tileSize}}
            height={{this.tileSize}}
            rx="3"
            style={{cell.rectStyle}}
            class={{cell.rectClass}}
          />
          <text
            x={{cell.xCenter}}
            y={{cell.yCenter}}
            text-anchor="middle"
            dominant-baseline="middle"
            style={{cell.textStyle}}
          >
            {{cell.value}}
          </text>
        </g>
      {{/each}}
    </svg>
  </template>
}
