import { modifier } from 'ember-modifier';

const previousRects = new WeakMap<HTMLElement, DOMRect>();

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default modifier((element: HTMLElement) => {
  const next = element.getBoundingClientRect();
  const prev = previousRects.get(element);

  previousRects.set(element, next);

  if (!prev) {
    return;
  }

  if (prefersReducedMotion()) {
    return;
  }

  const deltaX = prev.left - next.left;
  const deltaY = prev.top - next.top;

  if (deltaX === 0 && deltaY === 0) {
    return;
  }

  const previousTransition = element.style.transition;

  element.style.transition = 'none';
  element.style.setProperty('--flip-x', `${deltaX}px`);
  element.style.setProperty('--flip-y', `${deltaY}px`);

  // Force reflow so the browser applies the inverted transform before we animate back.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  element.offsetHeight;

  requestAnimationFrame(() => {
    element.style.transition = previousTransition;
    element.style.setProperty('--flip-x', '0px');
    element.style.setProperty('--flip-y', '0px');
  });
});
