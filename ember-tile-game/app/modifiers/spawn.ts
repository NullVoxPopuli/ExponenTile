import { modifier } from 'ember-modifier';

const spawned = new WeakSet<HTMLElement>();

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function shouldSkipAnimation(element: HTMLElement): boolean {
  // Check if the element has --move-duration set to 0 (automated mode)
  const duration = getComputedStyle(element).getPropertyValue('--move-duration');
  return duration === '0ms' || duration === '0';
}

export default modifier((element: HTMLElement) => {
  if (spawned.has(element)) {
    return;
  }

  spawned.add(element);

  if (prefersReducedMotion() || shouldSkipAnimation(element)) {
    // Skip animation - just mark as spawned immediately
    element.dataset.spawned = 'true';
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
