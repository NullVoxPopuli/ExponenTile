import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import Service from '@ember/service';

import {
  type Board,
  type BoardPoints,
  copyBoard,
  generateBoard,
  getPositionsThatAlmostMatch,
  isAdjacent,
  isGameOver,
  type MatchedTile,
  moveTilesDown,
  type Position,
  positionToNumber,
  setTile,
  swapTile,
  type Tile,
  tileAt,
  uniqueNewMatches,
} from '../game/board';
import { boardContains2048Tile } from '../utils/sharing';
import { sleep } from '../utils/sleep';
import {
  getGameState,
  getHighscore,
  getRandomizeCount,
  saveGameState,
  saveToPersistedState,
  setHighscore,
  setRandomizeCount,
} from '../utils/stored-state';

export default class GameService extends Service {
  /**
   * Fixed default animation duration (settings UI removed).
   * Matches the previous "medium" feel.
   */
  // Keep gameplay snappy.
  readonly animationDurationMs = 180;

  @tracked moveDurationMs = this.animationDurationMs;
  // A more human-readable easing (slower at the start than our previous curve)
  // so long drops look like they "fall" instead of snapping.
  @tracked moveEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
  @tracked moveDistanceByTileId: Record<number, number> = {};
  @tracked spawnRowsByTileId: Record<number, number> = {};
  @tracked moveDelayByTileId: Record<number, number> = {};
  @tracked maxMoveDelayMs = 0;
  @tracked spawnPositions: Set<number> = new Set(); // positions with spawning tiles

  readonly size = 8;

  @tracked board: Board = generateBoard(this.size);
  @tracked points = 0;
  @tracked moves = 0;
  @tracked loading = true;
  @tracked animating = false;
  @tracked selectedFrom: Position | undefined = undefined;
  @tracked dragPreviewFrom: Position | undefined = undefined;
  @tracked dragPreviewTo: Position | undefined = undefined;
  @tracked dragPreviewX = 0;
  @tracked dragPreviewY = 0;
  @tracked highscore = 0;
  @tracked debug = false;
  @tracked gameOverClosed = false;
  @tracked randomizeCount = 0;
  @tracked skipAnimationDelays = false;
  @tracked animationSpeedMultiplier = 1;

  @tracked invalidTileIds: number[] = [];

  @tracked hintTileIds: number[] = [];

  @tracked mergePhase: 'none' | 'highlight' | 'collapse' = 'none';

  private animationToken = 0;
  private invalidToken = 0;
  private hintToken = 0;

  private mergeTargetsCache = new WeakMap<Board, Set<number>>();

  constructor(owner: unknown) {
    super(owner as never);
    this.highscore = getHighscore();
    this.randomizeCount = getRandomizeCount();
    this.loadSavedState();
  }

  get gameOver(): boolean {
    return isGameOver(this.board);
  }

  get showGameOver(): boolean {
    // `gameOver` can become true during intermediate animation steps (e.g.
    // before gravity/spawn resolves). Only surface the modal once the
    // animation loop has fully completed and the board is at rest.
    return (
      !this.loading &&
      !this.animating &&
      this.gameOver &&
      !this.gameOverClosed
    );
  }

  @action
  closeGameOver(): void {
    this.gameOverClosed = true;
  }

  resetBoard(): void {
    const newBoard = generateBoard(this.size);

    saveGameState(newBoard, 0, 0);

    this.animationToken++;
    this.animating = false;
    this.mergePhase = 'none';
    this.moveDurationMs = this.animationDurationMs;
    this.moveEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    this.moveDistanceByTileId = {};
    this.spawnRowsByTileId = {};
    this.moveDelayByTileId = {};
    this.maxMoveDelayMs = 0;
    this.clearHint();
    this.gameOverClosed = false;
    this.points = 0;
    this.moves = 0;
    this.randomizeCount = 0;
    setRandomizeCount(0);
    this.selectedFrom = undefined;
    this.board = newBoard;
  }

  @action
  async randomizeTiles(): Promise<void> {
    // Apply a 25% point penalty (rounded down)
    const penalty = Math.floor(this.points / 4);
    this.points = Math.max(0, this.points - penalty);

    // Collect all tiles from the board
    const allTiles: Tile[] = [];

    for (let x = 0; x < this.board.length; x++) {
      for (let y = 0; y < this.board[x]!.length; y++) {
        const tile = this.board[x]![y];

        if (tile && !tile.removed) {
          allTiles.push(tile);
        }
      }
    }

    // Shuffle the tiles using Fisher-Yates algorithm
    for (let i = allTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = allTiles[i];

      allTiles[i] = allTiles[j]!;
      allTiles[j] = temp!;
    }

    // Create a new board to trigger reactivity
    const shuffledBoard = copyBoard(this.board);

    // Place shuffled tiles back on the new board
    let tileIndex = 0;

    for (let x = 0; x < shuffledBoard.length; x++) {
      for (let y = 0; y < shuffledBoard[x]!.length; y++) {
        if (shuffledBoard[x]![y] && !shuffledBoard[x]![y]!.removed) {
          if (tileIndex < allTiles.length) {
            shuffledBoard[x]![y] = allTiles[tileIndex]!;
            tileIndex++;
          }
        }
      }
    }

    // Increment randomize count
    this.randomizeCount++;
    setRandomizeCount(this.randomizeCount);

    // Close the game over modal
    this.gameOverClosed = true;

    // Clear the hint
    this.clearHint();

    // Process the shuffled board through the animation system
    await this.processShuffledBoard(shuffledBoard);

    // Save the updated game state
    saveGameState(this.board, this.points, this.moves);
  }

  private async processShuffledBoard(shuffledBoard: Board): Promise<void> {
    // Check if there are any matches on the shuffled board
    const matches = uniqueNewMatches(shuffledBoard);

    const token = ++this.animationToken;

    this.animating = true;
    this.mergePhase = 'none';
    this.moveDistanceByTileId = {};
    this.spawnRowsByTileId = {};
    this.moveDelayByTileId = {};
    this.maxMoveDelayMs = 0;

    // Start with the shuffled board visible immediately
    this.board = shuffledBoard;

    if (matches.length === 0) {
      // No matches, we're done
      this.animating = false;

      return;
    }

    // Build the sequence of board states to animate through
    const boards: BoardPoints[] = [];
    let currentBoard = shuffledBoard;
    let currentMatches = matches;

    while (currentMatches.length > 0) {
      const newBoard = copyBoard(currentBoard);

      // First, create the board with removed tiles (old values still)
      const boardWithRemovedTilesOldValues = copyBoard(newBoard);

      for (const match of currentMatches) {
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
      const boardWithUpgradedValues = copyBoard(newBoard);

      for (const match of currentMatches) {
        const previous = tileAt(boardWithUpgradedValues, match.origin);

        setTile(boardWithUpgradedValues, match.origin, { ...previous, value: match.newValue });
      }

      // Apply gravity starting from the upgraded board
      const [, boardAfterGravity] = moveTilesDown(
        currentMatches,
        boardWithUpgradedValues
      );

      boards.push(
        { board: newBoard, points: 0 },
        { board: boardWithRemovedTilesOldValues, points: 0 },
        {
          board: boardWithUpgradedValues,
          points: currentMatches.reduce(
            (acc, match) => Math.pow(2, match.newValue) + acc,
            0
          ),
        },
        { board: boardAfterGravity, points: 0 }
      );

      currentMatches = uniqueNewMatches(boardAfterGravity);
      currentBoard = boardAfterGravity;
    }

    // Now animate through all the board states
    let previousBoardStep: Board | undefined = shuffledBoard;
    let boardForMovementCalc: Board | undefined = shuffledBoard;
    let mergeTargetTileIds: Set<number> = new Set();

    for (const [index, step] of boards.entries()) {
      if (token !== this.animationToken) {
        this.mergePhase = 'none';

        return;
      }

      const hasRemovedTiles = boardHasRemovedTiles(step.board);

      // Check if this is the value upgrade step (has removed tiles + points awarded)
      const isValueUpgrade = hasRemovedTiles && step.points > 0;

      // Track merge target tiles when we see the value upgrade
      if (isValueUpgrade) {
        mergeTargetTileIds = this.getMergeTargetsForBoard(step.board);
      }

      // Check if this is the first board after merge (gravity following upgrade)
      const isPostMergeGravity = mergeTargetTileIds.size > 0 && !hasRemovedTiles;

      // Don't calculate or apply movement for post-merge gravity yet
      // We'll handle it after waiting for the merge target animation to complete
      const movementInfo: MovementInfo =
        boardForMovementCalc && !isValueUpgrade && !isPostMergeGravity
          ? getMovementInfo(boardForMovementCalc, step.board)
          : { maxDistanceSteps: 0, moveDistanceByTileId: {}, spawnRowsByTileId: {} };

      const delayInfo = getMoveDelayInfo(
        movementInfo.moveDistanceByTileId,
        isPostMergeGravity ? mergeTargetTileIds : undefined
      );

      // Clear merge target tracking after applying the delay
      if (isPostMergeGravity) {
        mergeTargetTileIds = new Set();
      }

      // If this is post-merge gravity, wait BEFORE setting board and calculating movement
      if (isPostMergeGravity) {
        // Wait for merge target bump animation to complete
        const waitedForMergeAnimation = await sleepChecked(token, this, 200 * this.animationSpeedMultiplier);

        if (!waitedForMergeAnimation) {
          this.mergePhase = 'none';

          return;
        }

        // Now calculate the gravity movement
        const gravityMovement = boardForMovementCalc
          ? getMovementInfo(boardForMovementCalc, step.board)
          : { maxDistanceSteps: 0, moveDistanceByTileId: {}, spawnRowsByTileId: {} };

        // For gravity, all tiles start falling at the same time (no stagger)
        this.moveDistanceByTileId = gravityMovement.moveDistanceByTileId;
        this.spawnRowsByTileId = gravityMovement.spawnRowsByTileId;
        this.moveDelayByTileId = {};
        this.maxMoveDelayMs = 0;
        this.moveEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        this.moveDurationMs = getGravityDurationMs(
          this.animationDurationMs,
          gravityMovement.maxDistanceSteps
        );
        // Give the browser a frame to commit the new
        // duration/easing variables before positions change,
        // so the transform transition will animate instead of snapping.
        await sleep(0);

        // NOW set the board to trigger the gravity animation
        this.board = step.board;
        this.points = this.points + step.points;

        boardForMovementCalc = step.board;
      } else if (!isValueUpgrade && movementInfo.maxDistanceSteps > 0) {
        // This is gravity from a previous merge, use ease-in
        // All gravity tiles start at the same time (no stagger)
        this.moveDistanceByTileId = movementInfo.moveDistanceByTileId;
        this.spawnRowsByTileId = movementInfo.spawnRowsByTileId;
        this.moveDelayByTileId = {};
        this.maxMoveDelayMs = 0;
        this.moveEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        this.moveDurationMs = getGravityDurationMs(
          this.animationDurationMs,
          movementInfo.maxDistanceSteps
        );
        // Commit transition vars first, then positions next tick.
        await sleep(0);

        this.board = step.board;
        this.points = this.points + step.points;
      } else {
        this.moveDistanceByTileId = movementInfo.moveDistanceByTileId;
        this.spawnRowsByTileId = movementInfo.spawnRowsByTileId;
        this.moveDelayByTileId = delayInfo.delayByTileId;
        this.maxMoveDelayMs = delayInfo.maxDelayMs;
        this.moveEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
        this.moveDurationMs = getGravityDurationMs(
          this.animationDurationMs,
          movementInfo.maxDistanceSteps
        );

        this.board = step.board;
        this.points = this.points + step.points;
      }

      // Merge animation sequence:
      // When we see removed tiles with no points, it's the highlight/collapse phase
      // When we see removed tiles with points, it's the value upgrade (after collapse)
      if (index < boards.length - 1 && hasRemovedTiles) {
        if (step.points === 0) {
          // Start of merge: highlight the group
          this.mergePhase = 'highlight';

          const stepDelayMs = getStepDelayMs(this.moveDurationMs);

          // Give humans time to see the match before it collapses.
          const stillActiveAfterHighlight = await sleepChecked(
            token,
            this,
            Math.max(100, Math.min(160, Math.round(stepDelayMs * 0.4))) * this.animationSpeedMultiplier
          );

          if (!stillActiveAfterHighlight) {
            this.mergePhase = 'none';

            return;
          }

          this.mergePhase = 'collapse';

          // Let the collapse animation play.
          const stillActiveAfterCollapse = await sleepChecked(
            token,
            this,
            Math.max(80, stepDelayMs * 0.15) * this.animationSpeedMultiplier
          );

          if (!stillActiveAfterCollapse) {
            this.mergePhase = 'none';

            return;
          }


          boardForMovementCalc = step.board;
          continue;
        } else {
          // Value has been upgraded, end the merge phase
          this.mergePhase = 'none';

          // Pre-calculate gravity movement for the next step so merged tile isn't static
          // We'll apply it after the upgrade visibility delay
          let nextGravityMovement = { maxDistanceSteps: 0, moveDistanceByTileId: {}, spawnRowsByTileId: {} };

          const nextStep = boards[index + 1];

          if (nextStep && boardForMovementCalc) {
            nextGravityMovement = getMovementInfo(boardForMovementCalc, nextStep.board);
          }

          // Small beat to see the new value
          const stillActiveAfterUpgrade = await sleepChecked(token, this, 200 * this.animationSpeedMultiplier);

          if (!stillActiveAfterUpgrade) {
            return;
          }

          // Now apply all gravity properties so merged tile starts animating immediately
          this.moveDistanceByTileId = nextGravityMovement.moveDistanceByTileId;
          this.spawnRowsByTileId = nextGravityMovement.spawnRowsByTileId;
          this.moveDelayByTileId = {};
          this.maxMoveDelayMs = 0;
          this.moveEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          this.moveDurationMs = getGravityDurationMs(
            this.animationDurationMs,
            nextGravityMovement.maxDistanceSteps
          );

          // Don't update boardForMovementCalc - we want the next step (gravity)
          // to calculate movement from the previous board (with removed tiles), not this one

          continue;
        }
      }

      // Wait for the tiles to finish moving down if this step is a gravity step
      if (this.maxMoveDelayMs > 0) {
        const waitedForMovement = await sleepChecked(
          token,
          this,
          this.moveDurationMs + this.maxMoveDelayMs + 50
        );

        if (!waitedForMovement) {
          return;
        }
      }


      boardForMovementCalc = step.board;
    }

    this.mergePhase = 'none';
    this.animating = false;
  }

  hint(): void {
    const positions = getPositionsThatAlmostMatch(this.board);

    if (!positions) {
      return;
    }

    // Hint should not play the move; it only highlights it.
    const [a, b] = positions;
    const tileA = this.board[a.x]?.[a.y];
    const tileB = this.board[b.x]?.[b.y];

    if (!tileA || !tileB) {
      return;
    }

    // Bump the token so any previous timeout/rAF won't clobber this hint.
    const token = ++this.hintToken;

    // Clear first so CSS animations can re-trigger even if the same hint
    // is shown repeatedly.
    this.hintTileIds = [];

    requestAnimationFrame(() => {
      if (token === this.hintToken) {
        this.hintTileIds = [tileA.id, tileB.id];
      }
    });

    window.setTimeout(() => {
      if (token === this.hintToken) {
        this.hintTileIds = [];
      }
    }, 1600);
  }

  private clearHint(): void {
    this.hintToken++;
    this.hintTileIds = [];
  }

  @action
  autoSwap(): void {
    if (this.animating || this.gameOver) {
      return;
    }

    const positions = getPositionsThatAlmostMatch(this.board);

    if (!positions) {
      return;
    }

    const [a, b] = positions;

    this.clearHint();
    void this.swapTiles(a, b);
  }

  @action
  async autoPlayToGameOver(): Promise<void> {
    // Store the original animation duration
    const originalMoveDurationMs = this.moveDurationMs;
    const originalAnimationSpeedMultiplier = this.animationSpeedMultiplier;

    // Speed up animations for fast playback
    this.moveDurationMs = 1;
    this.animationSpeedMultiplier = 0.1;

    try {
      // Keep playing moves until the game is over
      while (!this.gameOver) {
        // If currently animating, wait for it to complete
        if (this.animating) {
          await sleep(10);
          continue;
        }

        const positions = getPositionsThatAlmostMatch(this.board);

        if (!positions) {
          // No valid moves left, game is over
          break;
        }

        const [a, b] = positions;

        this.clearHint();
        await this.swapTiles(a, b);
      }
    } finally {
      // Always restore original settings, even if interrupted
      this.moveDurationMs = originalMoveDurationMs;
      this.animationSpeedMultiplier = originalAnimationSpeedMultiplier;

      // Ensure the game over modal is shown
      this.gameOverClosed = false;
    }
  }

  async swapTiles(a: Position, b: Position): Promise<void> {
    if (this.animating) {
      return;
    }

    this.clearHint();

    const beforeBoard = this.board;
    const boards = swapTile(a, b, beforeBoard);

    const isInvalidMove = boards.length === 2;

    if (isInvalidMove) {
      const fromTile = beforeBoard[a.x]?.[a.y];
      const toTile = beforeBoard[b.x]?.[b.y];

      if (fromTile && toTile) {
        this.invalidTileIds = [fromTile.id, toTile.id];

        const clearToken = ++this.invalidToken;

        window.setTimeout(() => {
          if (clearToken === this.invalidToken) {
            this.invalidTileIds = [];
          }
        }, 450);
      }
    }

    // React increments moves on every attempted swap (including invalid swaps)
    this.moves = this.moves + 1;

    const token = ++this.animationToken;

    this.animating = true;
    this.mergePhase = 'none';
    this.moveDistanceByTileId = {};
    this.spawnRowsByTileId = {};
    this.moveDelayByTileId = {};
    this.maxMoveDelayMs = 0;

    let boardForMovementCalc: Board | undefined;
    let mergeTargetTileIds: Set<number> = new Set();

    for (const [index, step] of boards.entries()) {
      if (token !== this.animationToken) {
        this.mergePhase = 'none';

        return;
      }

      const hasRemovedTiles = boardHasRemovedTiles(step.board);

      // Check if this is the value upgrade step (has removed tiles + points awarded)
      const isValueUpgrade = hasRemovedTiles && step.points > 0;

      // Track merge target tiles when we see the value upgrade
      if (isValueUpgrade) {
        mergeTargetTileIds = this.getMergeTargetsForBoard(step.board);
      }

      // Check if this is the first board after merge (gravity following upgrade)
      const isPostMergeGravity = mergeTargetTileIds.size > 0 && !hasRemovedTiles;

      // Don't calculate or apply movement for post-merge gravity yet
      // We'll handle it after waiting for the merge target animation to complete
      const movementInfo: MovementInfo =
        boardForMovementCalc && !isValueUpgrade && !isPostMergeGravity
          ? getMovementInfo(boardForMovementCalc, step.board)
          : { maxDistanceSteps: 0, moveDistanceByTileId: {}, spawnRowsByTileId: {} };

      const delayInfo = getMoveDelayInfo(
        movementInfo.moveDistanceByTileId,
        isPostMergeGravity ? mergeTargetTileIds : undefined
      );

      // Clear merge target tracking after applying the delay
      if (isPostMergeGravity) {
        mergeTargetTileIds = new Set();
      }

      // If this is post-merge gravity, wait BEFORE setting board and calculating movement
      if (isPostMergeGravity) {
        // Wait for merge target bump animation to complete
        const waitedForMergeAnimation = await sleepChecked(token, this, 200 * this.animationSpeedMultiplier);

        if (!waitedForMergeAnimation) {
          this.mergePhase = 'none';

          return;
        }

        // Now calculate the gravity movement
        const gravityMovement = boardForMovementCalc
          ? getMovementInfo(boardForMovementCalc, step.board)
          : { maxDistanceSteps: 0, moveDistanceByTileId: {}, spawnRowsByTileId: {} };

        // For gravity, all tiles start falling at the same time (no stagger)
        this.moveDistanceByTileId = gravityMovement.moveDistanceByTileId;
        this.spawnRowsByTileId = gravityMovement.spawnRowsByTileId;
        this.moveDelayByTileId = {};
        this.maxMoveDelayMs = 0;
        this.moveEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        this.moveDurationMs = getGravityDurationMs(
          this.animationDurationMs,
          gravityMovement.maxDistanceSteps
        );

        // NOW set the board to trigger the gravity animation
        this.board = step.board;
        this.points = this.points + step.points;

        boardForMovementCalc = step.board;
      } else if (!isValueUpgrade && movementInfo.maxDistanceSteps > 0) {
        // This is gravity from a previous merge, use ease-in
        // All gravity tiles start at the same time (no stagger)
        this.moveDistanceByTileId = movementInfo.moveDistanceByTileId;
        this.spawnRowsByTileId = movementInfo.spawnRowsByTileId;
        this.moveDelayByTileId = {};
        this.maxMoveDelayMs = 0;
        this.moveEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        this.moveDurationMs = getGravityDurationMs(
          this.animationDurationMs,
          movementInfo.maxDistanceSteps
        );

        this.board = step.board;
        this.points = this.points + step.points;
      } else {
        this.moveDistanceByTileId = movementInfo.moveDistanceByTileId;
        this.spawnRowsByTileId = movementInfo.spawnRowsByTileId;
        this.moveDelayByTileId = delayInfo.delayByTileId;
        this.maxMoveDelayMs = delayInfo.maxDelayMs;
        this.moveEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
        this.moveDurationMs = getGravityDurationMs(
          this.animationDurationMs,
          movementInfo.maxDistanceSteps
        );

        this.board = step.board;
        this.points = this.points + step.points;
      }

      // Merge animation sequence:
      // When we see removed tiles with no points, it's the highlight/collapse phase
      // When we see removed tiles with points, it's the value upgrade (after collapse)
      if (index < boards.length - 1 && hasRemovedTiles) {
        if (step.points === 0) {
          // Start of merge: highlight the group
          this.mergePhase = 'highlight';

          const stepDelayMs = getStepDelayMs(this.moveDurationMs, 60);

          // Give humans time to see the match before it collapses.
          const stillActiveAfterHighlight = await sleepChecked(
            token,
            this,
            Math.max(100, Math.min(160, Math.round(stepDelayMs * 0.4))) * this.animationSpeedMultiplier
          );

          if (!stillActiveAfterHighlight) {
            this.mergePhase = 'none';

            return;
          }

          this.mergePhase = 'collapse';

          // Let the tiles slide together
          const stillActiveAfterCollapse = await sleepChecked(
            token,
            this,
            Math.max(80, Math.min(140, Math.round(stepDelayMs * 0.35))) * this.animationSpeedMultiplier
          );

          if (!stillActiveAfterCollapse) {
            this.mergePhase = 'none';

            return;
          }


          boardForMovementCalc = step.board;
          continue;
        } else {
          // Value has been upgraded, end the merge phase
          this.mergePhase = 'none';

          // Pre-calculate gravity movement for the next step so merged tile isn't static
          // We'll apply it after the upgrade visibility delay
          let nextGravityMovement = { maxDistanceSteps: 0, moveDistanceByTileId: {}, spawnRowsByTileId: {} };

          const nextStep = boards[index + 1];

          if (nextStep && boardForMovementCalc) {
            nextGravityMovement = getMovementInfo(boardForMovementCalc, nextStep.board);
          }

          // Small beat to see the new value before gravity starts
          const stillActiveAfterUpgrade = await sleepChecked(token, this, 200 * this.animationSpeedMultiplier);

          if (!stillActiveAfterUpgrade) {
            this.mergePhase = 'none';

            return;
          }

          // Now apply all gravity properties so merged tile starts animating immediately
          this.moveDistanceByTileId = nextGravityMovement.moveDistanceByTileId;
          this.spawnRowsByTileId = nextGravityMovement.spawnRowsByTileId;
          this.moveDelayByTileId = {};
          this.maxMoveDelayMs = 0;
          this.moveEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          this.moveDurationMs = getGravityDurationMs(
            this.animationDurationMs,
            nextGravityMovement.maxDistanceSteps
          );

          // Don't update boardForMovementCalc - we want the next step (gravity)
          // to calculate movement from the previous board (with removed tiles), not this one

          continue;
        }
      }

      {
        // Always wait at least one beat after applying a board step so the
        // browser has time to animate transforms.
        //
        // Without this, the *final* step (which is frequently the gravity step
        // with falling/spawning tiles) can appear to “snap” into place because
        // we immediately reset animation state after the loop.
        const stepDelayMs = getStepDelayMs(this.moveDurationMs, this.maxMoveDelayMs);

        const stillActive = await sleepChecked(token, this, stepDelayMs);

        if (!stillActive) {
          this.mergePhase = 'none';

          return;
        }
      }


      boardForMovementCalc = step.board;
    }

    if (boardContains2048Tile(this.board)) {
      saveToPersistedState({ key: '2048achievement', value: 'true' });
    }

    this.animating = false;
    this.mergePhase = 'none';
    this.moveDurationMs = this.animationDurationMs;
    this.moveEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    this.moveDistanceByTileId = {};
    this.spawnRowsByTileId = {};
    this.moveDelayByTileId = {};
    this.maxMoveDelayMs = 0;
    this.persistProgress();
  }

  isMergeTarget(position: Position): boolean {
    if (this.mergePhase === 'none') {
      return false;
    }

    const set = this.getMergeTargetsForBoard(this.board);

    return set.has(positionToNumber(position, this.board));
  }

  isMergeGroupTile(tile: Tile, position: Position): boolean {
    if (this.mergePhase === 'none') {
      return false;
    }

    return tile.removed || this.isMergeTarget(position);
  }

  isTokenActive(token: number): boolean {
    return token === this.animationToken;
  }

  private getMergeTargetsForBoard(board: Board): Set<number> {
    const cached = this.mergeTargetsCache.get(board);

    if (cached) {
      return cached;
    }

    const targets = new Set<number>();

    for (let x = 0; x < board.length; x++) {
      const column = board[x];

      if (!column) {
        continue;
      }

      for (let y = 0; y < column.length; y++) {
        const tile = column[y];

        if (tile?.removed) {
          targets.add(positionToNumber(tile.mergedTo, board));
        }
      }
    }

    this.mergeTargetsCache.set(board, targets);

    return targets;
  }

  private updateSpawnPositions(): void {
    const positions = new Set<number>();

    for (const [idString, spawnRows] of Object.entries(this.spawnRowsByTileId)) {
      if (spawnRows > 0) {
        // Find this tile's position in the current board
        for (let x = 0; x < this.board.length; x++) {
          const column = this.board[x];

          if (!column) {
            continue;
          }

          for (let y = 0; y < column.length; y++) {
            const tile = column[y];

            if (tile?.id === Number(idString)) {
              positions.add(positionToNumber({ x, y }, this.board));
            }
          }
        }
      }
    }

    this.spawnPositions = positions;
  }

  clickTile(position: Position): void {
    if (this.animating) {
      return;
    }

    this.clearHint();

    if (!this.selectedFrom) {
      this.selectedFrom = position;

      return;
    }

    if (
      (this.selectedFrom.x === position.x &&
        this.selectedFrom.y === position.y) ||
      !isAdjacent(this.selectedFrom, position)
    ) {
      this.selectedFrom = undefined;

      return;
    }

    const from = this.selectedFrom;

    this.selectedFrom = undefined;
    void this.swapTiles(from, position);
  }

  /**
   * Swipe direction helper for pointer interactions.
   */
  swipeFrom(position: Position, deltaX: number, deltaY: number): void {
    if (this.animating) {
      return;
    }

    this.clearHint();

    const offsetX = Math.abs(deltaX);
    const offsetY = Math.abs(deltaY);

    let swipeToPosition: Position | undefined;

    if (offsetX > offsetY) {
      swipeToPosition =
        deltaX > 0
          ? { x: position.x + 1, y: position.y }
          : { x: position.x - 1, y: position.y };
    } else {
      swipeToPosition =
        deltaY > 0
          ? { x: position.x, y: position.y + 1 }
          : { x: position.x, y: position.y - 1 };
    }

    this.selectedFrom = undefined;

    if (swipeToPosition) {
      void this.swapTiles(position, swipeToPosition);
    }
  }

  updateDragPreview(
    from: Position,
    deltaX: number,
    deltaY: number,
    stepPx: number
  ): void {
    if (this.animating) {
      return;
    }

    this.clearHint();

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    const factor = 0.75;
    const max = Math.max(0, stepPx * factor);

    let to: Position | undefined;
    let previewX = 0;
    let previewY = 0;

    if (absX > absY) {
      to = {
        x: from.x + (deltaX > 0 ? 1 : -1),
        y: from.y,
      };
      previewX = clamp(-deltaX * factor, -max, max);
    } else if (absY > 0) {
      to = {
        x: from.x,
        y: from.y + (deltaY > 0 ? 1 : -1),
      };
      previewY = clamp(-deltaY * factor, -max, max);
    }

    if (!to || !this.isInBounds(to)) {
      this.clearDragPreview();

      return;
    }

    this.dragPreviewFrom = from;
    this.dragPreviewTo = to;
    this.dragPreviewX = previewX;
    this.dragPreviewY = previewY;
  }

  clearDragPreview(): void {
    this.dragPreviewFrom = undefined;
    this.dragPreviewTo = undefined;
    this.dragPreviewX = 0;
    this.dragPreviewY = 0;
  }

  isPreviewTarget(position: Position): boolean {
    const to = this.dragPreviewTo;

    return Boolean(to && to.x === position.x && to.y === position.y);
  }

  getPreviewOffset(position: Position): { x: number; y: number } {
    if (!this.isPreviewTarget(position)) {
      return { x: 0, y: 0 };
    }

    return { x: this.dragPreviewX, y: this.dragPreviewY };
  }

  private isInBounds({ x, y }: Position): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  private loadSavedState(): void {
    const gameState = getGameState();

    if (!gameState || gameState.points === 0) {
      this.loading = false;

      return;
    }

    this.board = gameState.board;
    this.points = gameState.points;
    this.moves = gameState.moves;
    this.loading = false;
  }

  private persistProgress(): void {
    if (this.animating) {
      return;
    }

    saveGameState(this.board, this.points, this.moves);

    if (!this.debug && this.points > this.highscore) {
      setHighscore(this.points);
      this.highscore = this.points;
    }
  }
}

function boardHasRemovedTiles(board: Board): boolean {
  for (const column of board) {
    for (const tile of column) {
      if (tile.removed) {
        return true;
      }
    }
  }

  return false;
}

function getStepDelayMs(durationMs: number, extraDelayMs = 0): number {
  // Small cushion so transforms can finish (but keep things fast).
  return Math.max(60, durationMs) + Math.max(0, extraDelayMs);
}

function getGravityDurationMs(baseDurationMs: number, maxDistanceSteps: number): number {
  if (maxDistanceSteps <= 1) {
    return baseDurationMs;
  }

  // Longer for bigger falls so nothing gets cut off mid-transition.
  // This value is also used to decide how long we wait before advancing to the
  // next board state, so it must cover the longest fall.
  // Longer + less "front-loaded" than before so the cascade is obvious.
  // Slightly longer for bigger falls, but still quick.
  // This duration is also used to decide how long we wait before advancing to
  // the next board state, so it must cover the longest fall.
  const base = Math.max(220, Math.round(baseDurationMs * 1.05));
  const extra = Math.max(0, Math.round(maxDistanceSteps) * 40);

  return Math.min(650, base + extra);
}

type MovementInfo = {
  maxDistanceSteps: number;
  moveDistanceByTileId: Record<number, number>;
  spawnRowsByTileId: Record<number, number>;
};

type MoveDelayInfo = {
  maxDelayMs: number;
  delayByTileId: Record<number, number>;
};

function getMoveDelayInfo(
  moveDistanceByTileId: Record<number, number>,
  mergeTargetTileIds?: Set<number>
): MoveDelayInfo {
  // Stagger by distance so it feels like a cascade: tiles that move 1 cell
  // start immediately, tiles that move 2 start a beat later, etc.
  const STAGGER_MS_PER_STEP = 25;

  // If we have merge targets, delay all non-merge tiles so merge tiles move first
  const MERGE_TARGET_PRIORITY_DELAY_MS = 400;

  const delayByTileId: Record<number, number> = {};
  let maxDelayMs = 0;

  for (const [idString, distance] of Object.entries(moveDistanceByTileId)) {
    const id = Number(idString);
    const isMergeTarget = mergeTargetTileIds?.has(id) ?? false;

    let delay = 0;

    // Merge targets move first with no delay
    // All other tiles wait for merge target to finish, then cascade
    if (!isMergeTarget && mergeTargetTileIds && mergeTargetTileIds.size > 0) {
      delay = MERGE_TARGET_PRIORITY_DELAY_MS;
    }

    // Add cascade delay based on distance
    if (distance > 1) {
      delay += (distance - 1) * STAGGER_MS_PER_STEP;
    }

    if (delay > 0) {
      delayByTileId[id] = delay;
      maxDelayMs = Math.max(maxDelayMs, delay);
    }
  }

  return { delayByTileId, maxDelayMs };
}

function getMovementInfo(previous: Board, next: Board): MovementInfo {
  const prevPosById = new Map<number, Position>();

  for (let x = 0; x < previous.length; x++) {
    const column = previous[x];

    if (!column) {
      continue;
    }

    for (let y = 0; y < column.length; y++) {
      const tile = column[y];

      if (tile) {
        prevPosById.set(tile.id, { x, y });
      }
    }
  }

  const newTilesByColumn = new Map<number, number[]>();
  const moveDistanceByTileId: Record<number, number> = {};
  let maxDistanceSteps = 0;

  for (let x = 0; x < next.length; x++) {
    const column = next[x];

    if (!column) {
      continue;
    }

    for (let y = 0; y < column.length; y++) {
      const tile = column[y];

      if (!tile) {
        continue;
      }

      const prevPos = prevPosById.get(tile.id);

      if (!prevPos) {
        const list = newTilesByColumn.get(x) ?? [];

        list.push(tile.id);
        newTilesByColumn.set(x, list);

        continue;
      }

      const distance = Math.max(
        Math.abs(prevPos.x - x),
        Math.abs(prevPos.y - y)
      );

      if (distance > 0) {
        moveDistanceByTileId[tile.id] = distance;
        maxDistanceSteps = Math.max(maxDistanceSteps, distance);
      }
    }
  }

  const spawnRowsByTileId: Record<number, number> = {};

  for (const tileIds of newTilesByColumn.values()) {
    const spawnRows = tileIds.length;

    if (spawnRows <= 0) {
      continue;
    }

    for (const id of tileIds) {
      spawnRowsByTileId[id] = spawnRows;
      moveDistanceByTileId[id] = Math.max(moveDistanceByTileId[id] ?? 0, spawnRows);
    }

    maxDistanceSteps = Math.max(maxDistanceSteps, spawnRows);
  }

  return { maxDistanceSteps, moveDistanceByTileId, spawnRowsByTileId };
}

async function sleepChecked(
  token: number,
  game: GameService,
  ms: number
): Promise<boolean> {
  if (!game.skipAnimationDelays) {
    await sleep(ms);
  }

  return game.isTokenActive(token);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

declare module '@ember/service' {
  interface Registry {
    game: GameService;
  }
}
