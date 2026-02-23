import { Field } from '@quon/core';
import { Element, Component, ElementNode, SortedElement } from './types';
import { isField } from './utils';

/**
 * JSX factory function (automatic runtime)
 * Called as jsx(tag, props, key) by the automatic JSX transform.
 * Children are passed inside props.children, NOT as rest args.
 */
export function jsx(
  tag: string | Component,
  props: Record<string, unknown> | null
): Element {
  const actualProps = props ?? {};
  const rawChildren = actualProps.children;
  const actualChildren =
    rawChildren == null
      ? []
      : Array.isArray(rawChildren)
        ? flattenChildren(rawChildren)
        : flattenChildren([rawChildren]);

  // If tag is a function (component), call it and return the Field<Element>
  if (typeof tag === 'function') {
    return tag({ ...actualProps, children: actualChildren });
  }

  // Remove children from props before creating the ElementNode
  const { children: _, ...restProps } = actualProps;

  // If tag is a string, create an ElementNode
  return new ElementNode(tag, restProps, actualChildren);
}

/**
 * Flatten JSX children
 */
function flattenChildren(children: unknown[]): Element[] {
  const result: Element[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else if (child != null && child !== false && child !== true) {
      result.push(child as Element);
    }
  }
  return result;
}

/**
 * Fragment component - renders children directly
 */
export function Fragment(props: { children?: Element[] }): Element {
  return props.children ?? [];
}

export function Sort({
  by,
  children,
}: {
  by:
    | Field<unknown[]>
    | unknown[]
    | ((x: unknown, y: unknown) => Field<boolean> | boolean);
  children: Field<Element>;
}): Element {
  return new SortedElement(
    isField(by)
      ? by
      : by instanceof Function
        ? (x, y) => {
            const result = by(x, y);
            return isField(result) ? result : Field.pure(result);
          }
        : Field.pure(by),
    children
  );
}

/**
 * Helper to wrap a Field<Element> as an Element
 * This allows using Field<Element> directly in JSX
 */
export function wrapField(field: Field<Element>): Element {
  return field;
}
