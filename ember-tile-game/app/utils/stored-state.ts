import {
  type Board,
  type GameState,
  getGameStateAsString,
  getStateFromString,
} from '../game/board';

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function saveToPersistedState({
  key,
  value,
}: {
  key: string;
  value: string;
}): void {
  safeLocalStorage()?.setItem(key, value);
}

export function getFromPersistedState({
  key,
}: {
  key: string;
}): string | undefined {
  const value = safeLocalStorage()?.getItem(key);

  return value ?? undefined;
}

export function setHighscore(highscore: number): void {
  saveToPersistedState({ key: 'highscore', value: highscore.toString() });
}

export function getHighscore(): number {
  const highscoreString = getFromPersistedState({ key: 'highscore' });

  return parseInt(highscoreString ?? '0', 10);
}

export function isTutorialDone(): boolean {
  return Boolean(getFromPersistedState({ key: 'doneTutorial' }));
}

export function finishedTutorial(): void {
  saveToPersistedState({ key: 'doneTutorial', value: 'true' });
}

export function saveGameState(
  board: Board,
  points: number,
  moves: number
): void {
  const gameStateString = getGameStateAsString(board, points, moves);

  saveToPersistedState({ key: 'gameState', value: gameStateString });
}

export function getGameState(): GameState | undefined {
  const gameStateString = getFromPersistedState({ key: 'gameState' });

  if (!gameStateString) {
    return undefined;
  }

  try {
    return getStateFromString(gameStateString);
  } catch {
    return undefined;
  }
}

export function setRandomizeCount(count: number): void {
  saveToPersistedState({ key: 'randomizeCount', value: count.toString() });
}

export function getRandomizeCount(): number {
  const countString = getFromPersistedState({ key: 'randomizeCount' });

  return parseInt(countString ?? '0', 10);
}
