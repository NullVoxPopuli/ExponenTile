import { modifier } from 'ember-modifier';

const spawned = new WeakSet<HTMLElement>();

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default modifier((element: HTMLElement) => {
  if (spawned.has(element)) {
    return;
  }

  spawned.add(element);

  if (prefersReducedMotion()) {
    return;
  }

  // Start slightly above and fade in.
  element.style.setProperty('--spawn-y', '-80px');
  element.style.opacity = '0';

  // Force initial style application.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  element.offsetHeight;

  requestAnimationFrame(() => {
    element.style.setProperty('--spawn-y', '0px');
    element.style.opacity = '1';
  });
});
