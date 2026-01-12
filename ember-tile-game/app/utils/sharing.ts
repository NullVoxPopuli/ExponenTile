import {
  type Board,
  getContrastTextColor,
  getRandomTile,
  getTileColor,
  type Tile,
} from '../game/board';

export function encodeStateInURL(board: Board, points: number): string {
  const boardNumbers = board.flat().map((tile) => tile.value);
  const sharingString = numbersToUrlSafeString(boardNumbers);

  return `b=${sharingString}&p=${points}&s=${board.length}`;
}

export function decodeStateFromURL(
  urlString: string
): { board: Board; points: number } | undefined {
  const params = new URLSearchParams(urlString);
  const boardString = params.get('b');
  const pointsString = params.get('p');
  const sizeString = params.get('s');

  if (boardString === null || pointsString === null || sizeString === null) {
    return undefined;
  }

  const points = parseInt(pointsString, 10);
  const size = parseInt(sizeString, 10);
  const boardNumbers = urlSafeStringToNumbers(boardString);

  if (
    Number.isNaN(points) ||
    Number.isNaN(size) ||
    boardNumbers.some(Number.isNaN)
  ) {
    return undefined;
  }

  // Note: this mirrors the original implementation (outer index corresponds
  // to the first number group in row-major order).
  const board: Board = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const index = y * size + x;

      return {
        ...getRandomTile(),
        value: boardNumbers[index] ?? 1,
      };
    })
  );

  return { board, points };
}

function numbersToUrlSafeString(numbers: number[]): string {
  const adjusted = numbers.map((n) => n - 1);

  // pack 2 nibbles per byte
  const bytes = new Uint8Array(Math.ceil(adjusted.length / 2));

  for (let i = 0; i < adjusted.length; i += 2) {
    const a = adjusted[i] ?? 0;
    const b = adjusted[i + 1] ?? 0;

    bytes[i / 2] = ((a & 0xf) << 4) | (b & 0xf);
  }

  const binary = String.fromCharCode(...bytes);
  const base64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return base64;
}

function urlSafeStringToNumbers(encodedString: string): number[] {
  const base64 = encodedString.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.substring(0, (3 * base64.length) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const numbers: number[] = [];

  for (const byte of bytes) {
    numbers.push(((byte >> 4) & 0xf) + 1);
    numbers.push((byte & 0xf) + 1);
  }

  return numbers;
}

export function drawBoardToPNG(
  board: Board,
  moves: number,
  score: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const tileSize = 64;
    const gap = 3;
    const footerFontSize = 16;
    const boardSize = board.length;
    const footerSize = gap * boardSize + footerFontSize;

    canvas.width = boardSize * (tileSize + gap) - gap;
    canvas.height = boardSize * (tileSize + gap) - gap + footerSize;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));

      return;
    }

    const fontName = window.getComputedStyle(document.body, null).fontFamily;

    board.forEach((row, x) => {
      row.forEach((tile, y) => {
        const xPos = x * (tileSize + gap);
        const yPos = y * (tileSize + gap);
        const tileColor = getTileColor(tile);

        const path = new Path2D();

        path.roundRect(xPos, yPos, tileSize, tileSize, 7);
        ctx.fillStyle = tileColor;
        ctx.fill(path);

        const textColor = getContrastTextColor(tileColor);

        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 22px ${fontName}`;

        ctx.fillText(
          Math.pow(2, tile.value).toString(),
          xPos + tileSize / 2,
          yPos + tileSize / 2
        );
      });
    });

    ctx.fillStyle = 'white';
    ctx.font = `bold 64px ${fontName}`;
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;

    ctx.fillText(
      score.toLocaleString('en-US'),
      (canvas.height - footerSize) / 2,
      canvas.width / 2
    );

    ctx.font = `bold ${footerFontSize}px ${fontName}`;
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `Moves: ${moves.toLocaleString('en-US')}`,
      gap,
      boardSize * (tileSize + gap) + 4 * gap
    );

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'ExponenTile',
      boardSize * (tileSize + gap) - gap,
      boardSize * (tileSize + gap) + 4 * gap
    );

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'ExponenTile.png', { type: 'image/png' });

        resolve(file);
      } else {
        reject(new Error('Canvas to Blob conversion failed'));
      }
    }, 'image/png');
  });
}

export function boardContains2048Tile(board: Board): boolean {
  return board.some((column) => column.some((tile) => tile.value === 11));
}

export function getTileDisplayValue(tile: Tile): number {
  return Math.pow(2, tile.value);
}
