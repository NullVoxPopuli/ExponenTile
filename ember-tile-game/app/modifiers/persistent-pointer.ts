import { modifier } from 'ember-modifier';

/**
 * Modifier to persistently attach pointer event listeners that won't be
 * re-attached during component re-renders. Useful for drag operations.
 */
export default modifier(
  (
    element: HTMLElement,
    [pointermoveHandler, pointerupHandler, pointercancelHandler]: [
      (event: PointerEvent) => void,
      (event: PointerEvent) => void,
      (event: PointerEvent) => void,
    ]
  ): (() => void) => {
    const handlePointerMove = (event: PointerEvent) => pointermoveHandler(event);
    const handlePointerUp = (event: PointerEvent) => pointerupHandler(event);
    const handlePointerCancel = (event: PointerEvent) => pointercancelHandler(event);

    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerCancel);
    };
  }
);
