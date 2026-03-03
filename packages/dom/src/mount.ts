import { Element } from './types';
import { useRender } from './render';
import { Field, toField } from '@quon/core';

/**
 * Mount an Element to a DOM node
 * This creates a Field that manages the rendering lifecycle
 *
 * @example
 * const app = mount(<App />, document.getElementById("root")!);
 * const { decay } = app.asOperator().exicite();
 *
 * // Later, to unmount:
 * await decay();
 */
export function mount(element: Element, parent: Node): Field<void> {
  return toField(() => {
    useRender(element, parent);
  });
}
