import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';

export const AnimationSpeeds = {
  instant: 0,
  fast: 0.2,
  medium: 0.4,
  slow: 0.7,
} as const;

export type AnimationSpeed = keyof typeof AnimationSpeeds;

export const GamePositions = ['top', 'bottom'] as const;
export type GamePosition = (typeof GamePositions)[number];

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export default class SettingsService extends Service {
  @tracked animationSpeed: AnimationSpeed = 'medium';
  @tracked gamePosition: GamePosition = 'top';

  constructor(owner: unknown) {
    super(owner as never);
    this.load();
  }

  get animationDurationSeconds(): number {
    return AnimationSpeeds[this.animationSpeed];
  }

  setAnimationSpeed(speed: AnimationSpeed): void {
    this.animationSpeed = speed;
    safeLocalStorage()?.setItem('animationSpeed', speed);
  }

  setGamePosition(position: GamePosition): void {
    this.gamePosition = position;
    safeLocalStorage()?.setItem('gamePosition', position);
  }

  private load(): void {
    const storage = safeLocalStorage();

    if (!storage) {
      return;
    }

    const speed = storage.getItem('animationSpeed') as AnimationSpeed | null;

    if (speed && Object.hasOwn(AnimationSpeeds, speed)) {
      this.animationSpeed = speed;
    }

    const position = storage.getItem('gamePosition') as GamePosition | null;

    if (position && (GamePositions as readonly string[]).includes(position)) {
      this.gamePosition = position;
    }
  }
}

declare module '@ember/service' {
  interface Registry {
    settings: SettingsService;
  }
}
