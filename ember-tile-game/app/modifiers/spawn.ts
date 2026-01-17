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

  // IMPORTANT: don't mutate inline style properties here.
  // The element's `style` attribute is controlled by Glimmer (`style={{...}}`),
  // and rerenders can wipe out imperative `element.style.setProperty(...)`.
  //
  // Instead, we toggle a data attribute which CSS uses to animate the spawn.
  // Default state (no data-spawned) renders offset by --spawn-from-y.
  // Next frame, mark as spawned so it transitions to 0.
  requestAnimationFrame(() => {
    element.dataset.spawned = 'true';
  });
});
