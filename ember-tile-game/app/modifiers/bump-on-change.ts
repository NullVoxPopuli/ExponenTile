import { modifier } from 'ember-modifier';

const previousValues = new WeakMap<HTMLElement, number>();

export default modifier((element: HTMLElement, [value]: [number]) => {
  const prev = previousValues.get(element);

  previousValues.set(element, value);

  if (prev === undefined) {
    return;
  }

  if (prev === value) {
    return;
  }

  element.classList.remove('tile-bump');
  // Force reflow so removing/adding re-triggers the animation.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  element.offsetHeight;
  element.classList.add('tile-bump');

  const onEnd = () => {
    element.classList.remove('tile-bump');
    element.removeEventListener('animationend', onEnd);
  };

  element.addEventListener('animationend', onEnd);

  return () => {
    element.removeEventListener('animationend', onEnd);
  };
});
