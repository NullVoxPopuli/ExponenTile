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
  // Mark as spawned *after* the element has had a chance to paint in its
  // initial state; otherwise the browser can apply the final state before the
  // first paint and the transition won't run.
  requestAnimationFrame(() => {
    // Force style/layout to ensure the initial transform is committed.
    element.getBoundingClientRect();

    requestAnimationFrame(() => {
      element.dataset.spawned = 'true';
    });
  });
});
