import { toField } from '@quon/core';
import { Component, Element } from './types';

/**
 * Create a component from a diagram function
 * Returns a function that can be used in JSX
 *
 * @example
 * const Counter = component(() => {
 *   const count = useAtom(0);
 *   return <div>{count}</div>;
 * });
 *
 * // Use in JSX:
 * <Counter />
 */
export function component<Props extends Record<string, unknown>>(
  diagram: (props: Props) => Element
): Component<Props> {
  return props => {
    return toField(() => diagram(props));
  };
}
