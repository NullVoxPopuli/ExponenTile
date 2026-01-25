import { modifier } from 'ember-modifier';

/**
 * Modifier to attach an event listener to the window object.
 * Usage: <div {{on-window "keydown" this.handleKeyDown}}>
 */
export default modifier(
  (
    _element: HTMLElement,
    [eventName, handler]: [string, (event: Event) => void]
  ): (() => void) => {
    window.addEventListener(eventName, handler);

    return () => {
      window.removeEventListener(eventName, handler);
    };
  }
);
