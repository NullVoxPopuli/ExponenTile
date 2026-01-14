import { modifier } from 'ember-modifier';

export default modifier((element: HTMLElement) => {
  element.classList.remove('tile-spawn');

  // Add on next frame so the browser sees a class change and runs the animation.
  requestAnimationFrame(() => {
    element.classList.add('tile-spawn');
  });

  const onEnd = () => {
    element.classList.remove('tile-spawn');
    element.removeEventListener('animationend', onEnd);
  };

  element.addEventListener('animationend', onEnd);

  return () => {
    element.removeEventListener('animationend', onEnd);
  };
});
