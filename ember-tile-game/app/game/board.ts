export type Position = { x: number; y: number };

export type Tile =
  | { id: number; value: number; removed: false }
  | { id: number; value: number; removed: true; mergedTo: Position };

// NOTE: board is column-major to match the original React implementation:
// board[x][y]
export type Board = Tile[][];

export type GameState = {
  board: Board;
  points: number;
  size: number;
  moves: number;
};

export type BoardPoints = { board: Board; points: number };

export type MatchedTile = {
  newValue: number;
  matchedTiles: Position[];
  origin: Position;
  match: true;
};

type NonMatch = { match: false };
type MatchResult = MatchedTile | NonMatch;

export function tileAt(board: Board, { x, y }: Position): Tile {
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

export function setTile(board: Board, { x, y }: Position, tile: Tile): void {
  const column = board[x];

  if (!column) {
    throw new Error(`Board column out of bounds: x=${x}`);
  }

  column[y] = tile;
}

function getRandomTileId(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function getRandomTileValue(): number {
  return Math.floor(Math.random() * 4) + 1;
}

export function getRandomTile(): Tile {
  return {
    id: getRandomTileId(),
    value: getRandomTileValue(),
    removed: false,
  };
}

/**
 * Turns a position into a unique number. Needs the board to get the length.
 */
export function positionToNumber({ x, y }: Position, board: Board): number {
  return y * board.length + x;
}

export function numberToPosition(number: number, board: Board): Position {
  const x = number % board.length;
  const y = Math.floor(number / board.length);

  return { x, y };
}

export function generateBoard(size: number): Board {
  const initialBoard: Board = Array.from({ length: size }).map(() =>
    Array.from({ length: size }).map(() => getRandomTile())
  );

  // Keep rerolling matched tiles until the board starts without any matches.
  let matchesOnBoard = getMatchesOnBoard(initialBoard);

  while (matchesOnBoard.length > 0) {
    for (const match of matchesOnBoard) {
      const previous = tileAt(initialBoard, match.origin);

      setTile(initialBoard, match.origin, {
        ...previous,
        value: getRandomTileValue(),
      });
    }

    matchesOnBoard = getMatchesOnBoard(initialBoard);
  }

  return initialBoard;
}

export function copyBoard(board: Board): Board {
  return board.slice().map((column) => column.slice());
}

export function isAdjacent(a: Position, b: Position): boolean {
  return (
    (a.x === b.x && Math.abs(a.y - b.y) === 1) ||
    (a.y === b.y && Math.abs(a.x - b.x) === 1)
  );
}

function isMoveValid(from: Position, to: Position, after: Board): boolean {
  if (!isAdjacent(from, to)) {
    return false;
  }

  return getMatchedTile(from, after).match || getMatchedTile(to, after).match;
}

function getSameTilesUp(position: Position, board: Board): Array<Position> {
  let result: Array<Position> = [];
  const tile = tileAt(board, position);
  const column = board[position.x];

  if (!column) {
    return result;
  }

  for (let y = position.y - 1; y >= 0; y--) {
    const candidate = column[y];

    if (!candidate || candidate.value !== tile.value) {
      break;
    }

    result = [...result, { x: position.x, y }];
  }

  return result;
}

function getSameTilesDown(position: Position, board: Board): Array<Position> {
  let result: Array<Position> = [];
  const tile = tileAt(board, position);
  const column = board[position.x];

  if (!column) {
    return result;
  }

  for (let y = position.y + 1; y < column.length; y++) {
    const candidate = column[y];

    if (!candidate || candidate.value !== tile.value) {
      break;
    }

    result = [...result, { x: position.x, y }];
  }

  return result;
}

function getSameTilesLeft(position: Position, board: Board): Array<Position> {
  let result: Array<Position> = [];
  const tile = tileAt(board, position);

  for (let x = position.x - 1; x >= 0; x--) {
    const candidate = board[x]?.[position.y];

    if (!candidate || candidate.value !== tile.value) {
      break;
    }

    result = [...result, { x, y: position.y }];
  }

  return result;
}

function getSameTilesRight(position: Position, board: Board): Array<Position> {
  let result: Array<Position> = [];
  const tile = tileAt(board, position);

  for (let x = position.x + 1; x < board.length; x++) {
    const candidate = board[x]?.[position.y];

    if (!candidate || candidate.value !== tile.value) {
      break;
    }

    result = [...result, { x, y: position.y }];
  }

  return result;
}

function getMatchedTile(position: Position, board: Board): MatchResult {
  const tile = tileAt(board, position);

  const tilesUp = getSameTilesUp(position, board);
  const tilesDown = getSameTilesDown(position, board);
  const tilesLeft = getSameTilesLeft(position, board);
  const tilesRight = getSameTilesRight(position, board);

  const tilesVertical = tilesUp.length + tilesDown.length;
  const tilesHorizontal = tilesLeft.length + tilesRight.length;

  let matchedTiles: Position[] = [];

  // Match only counts if there are at least 3 in a row.
  // If there's a match with 2 vertical and 1 horizontal, only the vertical should count.
  if (tilesVertical >= 2) {
    matchedTiles = [...matchedTiles, ...tilesUp, ...tilesDown];
  }

  if (tilesHorizontal >= 2) {
    matchedTiles = [...matchedTiles, ...tilesRight, ...tilesLeft];
  }

  const points = matchedTiles.length;

  if (points === 0) {
    return { match: false };
  }

  return {
    newValue: tile.value + points - 1,
    matchedTiles,
    origin: position,
    match: true,
  };
}

/**
 * The main thing. Returns a list of boards to be animated through.
 */
export function swapTile(
  from: Position,
  to: Position,
  board: Board
): BoardPoints[] {
  const swappedBoard = copyBoard(board);

  // Bounds protection (React version sometimes passes out-of-bounds during swipes)
  if (
    from.x < 0 ||
    from.y < 0 ||
    from.x >= swappedBoard.length ||
    from.y >= swappedBoard.length ||
    to.x < 0 ||
    to.y < 0 ||
    to.x >= swappedBoard.length ||
    to.y >= swappedBoard.length
  ) {
    return [{ board, points: 0 }];
  }

  const fromTile = tileAt(board, from);
  const toTile = tileAt(board, to);

  setTile(swappedBoard, to, fromTile);
  setTile(swappedBoard, from, toTile);

  if (!isMoveValid(from, to, swappedBoard)) {
    // Animate to the swapped board, then back again
    return [
      { board: swappedBoard, points: 0 },
      { board, points: 0 },
    ];
  }

  const newBoard = copyBoard(swappedBoard);
  const fromMatchedTile = getMatchedTile(from, newBoard);
  const toMatchedTile = getMatchedTile(to, newBoard);

  const matchedTiles: MatchedTile[] = [];

  if (fromMatchedTile.match) {
    matchedTiles.push(fromMatchedTile);
  }

  if (toMatchedTile.match) {
    matchedTiles.push(toMatchedTile);
  }

  // First, create the board with removed tiles (old values still)
  const boardWithRemovedTilesOldValues = copyBoard(newBoard);

  for (const match of matchedTiles) {
    for (const positionToRemove of match.matchedTiles) {
      const previous = tileAt(boardWithRemovedTilesOldValues, positionToRemove);
      setTile(boardWithRemovedTilesOldValues, positionToRemove, {
        ...previous,
        removed: true,
        mergedTo: match.origin,
      });
    }
  }

  // Create a board with upgraded values for the merge targets
  // Start from the board with removed tiles so they stay removed
  const boardWithUpgradedValues = copyBoard(boardWithRemovedTilesOldValues);

  if (fromMatchedTile.match) {
    const previous = tileAt(boardWithUpgradedValues, from);
    setTile(boardWithUpgradedValues, from, { ...previous, value: fromMatchedTile.newValue });
  }

  if (toMatchedTile.match) {
    const previous = tileAt(boardWithUpgradedValues, to);
    setTile(boardWithUpgradedValues, to, { ...previous, value: toMatchedTile.newValue });
  }

  // Apply gravity starting from the upgraded board
  const [, boardAfterGravity] = moveTilesDown(
    matchedTiles,
    boardWithUpgradedValues
  );

  const boardAfterCombos = findAndDoCombos(boardAfterGravity);

  return [
    { board: swappedBoard, points: 0 },
    { board: newBoard, points: 0 },
    { board: boardWithRemovedTilesOldValues, points: 0 },
    {
      board: boardWithUpgradedValues,
      points: matchedTiles.reduce(
        (acc, matchedTile) => Math.pow(2, matchedTile.newValue) + acc,
        0
      ),
    },
    { board: boardAfterGravity, points: 0 },
    ...boardAfterCombos,
  ];
}

export function moveTilesDown(
  matchedTiles: MatchedTile[],
  board: Board
): [Board, Board] {
  const boardWithRemovedTiles = copyBoard(board);

  const removed = new Set<number>();

  for (const match of matchedTiles) {
    for (const positionToRemove of match.matchedTiles) {
      removed.add(positionToNumber(positionToRemove, board));

      const previous = tileAt(boardWithRemovedTiles, positionToRemove);

      setTile(boardWithRemovedTiles, positionToRemove, {
        ...previous,
        removed: true,
        mergedTo: match.origin,
      });
    }
  }

  const newBoard = copyBoard(board);

  for (let x = 0; x < board.length; x++) {
    const sourceColumn = board[x];
    const targetColumn = newBoard[x];

    if (!sourceColumn || !targetColumn) {
      throw new Error(`Board column out of bounds during gravity: x=${x}`);
    }

    const height = sourceColumn.length;

    let writeY = height - 1;

    for (let y = height - 1; y >= 0; y--) {
      const position = { x, y };

      if (removed.has(positionToNumber(position, board))) {
        continue;
      }

      const sourceTile = sourceColumn[y];

      if (!sourceTile) {
        throw new Error(
          `Board cell out of bounds during gravity: x=${x} y=${y}`
        );
      }

      targetColumn[writeY] = sourceTile;
      writeY -= 1;
    }

    // Fill in from top
    for (let y = writeY; y >= 0; y--) {
      targetColumn[y] = getRandomTile();
    }
  }

  return [boardWithRemovedTiles, newBoard];
}

function findAndDoCombos(board: Board): BoardPoints[] {
  let result: BoardPoints[] = [];
  let matches = uniqueNewMatches(board);

  let previousBoard = copyBoard(board);

  while (matches.length > 0) {
    const newBoard = copyBoard(previousBoard);

    // First, create the board with removed tiles (old values still)
    const boardWithRemovedTilesOldValues = copyBoard(newBoard);

    for (const match of matches) {
      for (const positionToRemove of match.matchedTiles) {
        const previous = tileAt(boardWithRemovedTilesOldValues, positionToRemove);
        setTile(boardWithRemovedTilesOldValues, positionToRemove, {
          ...previous,
          removed: true,
          mergedTo: match.origin,
        });
      }
    }

    // Create a board with upgraded values for the merge targets
    // Start from the board with removed tiles so they stay removed
    const boardWithUpgradedValues = copyBoard(boardWithRemovedTilesOldValues);

    for (const match of matches) {
      const previous = tileAt(boardWithUpgradedValues, match.origin);
      setTile(boardWithUpgradedValues, match.origin, { ...previous, value: match.newValue });
    }

    // Apply gravity starting from the upgraded board
    const [, boardAfterGravity] = moveTilesDown(
      matches,
      boardWithUpgradedValues
    );

    result = [
      ...result,
      { board: newBoard, points: 0 },
      { board: boardWithRemovedTilesOldValues, points: 0 },
      {
        board: boardWithUpgradedValues,
        points: matches.reduce(
          (acc, match) => Math.pow(2, match.newValue) + acc,
          0
        ),
      },
      { board: boardAfterGravity, points: 0 },
    ];

    matches = uniqueNewMatches(boardAfterGravity);
    previousBoard = boardAfterGravity;
  }

  return result;
}

/**
 * Returns a list of positions that are the highest value matches.
 * For example if there's a tile that matches 5 vertically and 2 horizontally,
 * it will return that tile but not any of the other tiles of the match.
 */
export function uniqueNewMatches(board: Board): MatchedTile[] {
  const matchesOnBoard = getMatchesOnBoard(board);

  const matchValues = matchesOnBoard
    .map((match) => ({ position: match.origin, ...match }))
    .sort((a, b) => b.newValue - a.newValue);

  const seenPositions: Set<number> = new Set();
  let result: MatchedTile[] = [];

  for (const matchValue of matchValues) {
    if (
      seenPositions.has(positionToNumber(matchValue.position, board)) ||
      matchValue.matchedTiles.some((mt) =>
        seenPositions.has(positionToNumber(mt, board))
      )
    ) {
      continue;
    }

    seenPositions.add(positionToNumber(matchValue.position, board));
    matchValue.matchedTiles.forEach((mt) => {
      seenPositions.add(positionToNumber(mt, board));
    });

    result = [...result, matchValue];
  }

  return result;
}

function getMatchesOnBoard(board: Board): MatchedTile[] {
  const matches: MatchedTile[] = [];

  for (let x = 0; x < board.length; x++) {
    const column = board[x];

    if (!column) {
      continue;
    }

    for (let y = 0; y < column.length; y++) {
      const matchedTile = getMatchedTile({ x, y }, board);

      if (matchedTile.match) {
        matches.push(matchedTile);
      }
    }
  }

  return matches;
}

export function getPositionsThatAlmostMatch(
  board: Board
): [Position, Position] | undefined {
  for (let x = 0; x < board.length; x++) {
    const column = board[x];

    if (!column) {
      continue;
    }

    for (let y = 0; y < column.length; y++) {
      const position: Position = { x, y };

      const adjacentPositions: Position[] = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ];

      for (const adjPosition of adjacentPositions) {
        if (
          adjPosition.x < 0 ||
          adjPosition.x >= board.length ||
          adjPosition.y < 0 ||
          adjPosition.y >= column.length
        ) {
          continue;
        }

        const tempBoard = copyBoard(board);
        const tempTile = tileAt(tempBoard, position);

        setTile(tempBoard, position, tileAt(tempBoard, adjPosition));
        setTile(tempBoard, adjPosition, tempTile);

        if (
          getMatchedTile(position, tempBoard).match ||
          getMatchedTile(adjPosition, tempBoard).match
        ) {
          return [position, adjPosition];
        }
      }
    }
  }

  return undefined;
}

export function isGameOver(board: Board): boolean {
  return getPositionsThatAlmostMatch(board) === undefined;
}

export function getTileColor(tile: Tile): string {
  const colors = [
    '#0a9396',
    '#e9d8a6',
    '#ee9b00',
    '#ca6702',
    '#005f73',
    '#ae2012',
    '#86350f',
    '#94d2bd',
    '#9b2226',
  ];

  if (tile.value > colors.length - 1) {
    return `hsl(${(tile.value - colors.length) * 36} 100% 75%)`;
  }

  return colors[tile.value - 1] ?? '#0a9396';
}

export function getContrastTextColor(hexColor: string): string {
  if (!hexColor.startsWith('#')) {
    return '#101013';
  }

  let r = parseInt(hexColor.substring(1, 3), 16);
  let g = parseInt(hexColor.substring(3, 5), 16);
  let b = parseInt(hexColor.substring(5, 7), 16);

  const toLinear = (channel: number): number => {
    const color = channel / 255.0;

    return color <= 0.03928 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
  };

  r = toLinear(r);
  g = toLinear(g);
  b = toLinear(b);

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.5 ? '#101050' : '#fafafa';
}

export function getGameStateAsString(
  board: Board,
  points: number,
  moves: number
): string {
  const boardNumbers = board.flat().map((tile) => tile.value);

  const gameState = {
    boardNumbers,
    points,
    size: board.length,
    moves,
  };

  return encodeURIComponent(JSON.stringify(gameState));
}

export function getStateFromString(s: string): GameState {
  const gameState = JSON.parse(decodeURIComponent(s)) as {
    boardNumbers: number[];
    points: number;
    size: number;
    moves?: number;
  };

  const size = gameState.size;
  const boardNumbers = gameState.boardNumbers;
  const moves = gameState.moves ?? 0;

  // Preserve the column-major layout: board[x][y]
  const board: Board = Array.from({ length: size }, (_, x) =>
    Array.from({ length: size }, (_, y) => {
      const index = y * size + x;

      return {
        ...getRandomTile(),
        value: boardNumbers[index] ?? getRandomTileValue(),
      };
    })
  );

  return {
    board,
    points: gameState.points,
    size,
    moves,
  };
}
