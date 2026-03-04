import { Field, Scalar } from '@quon/core';
import { Element, Component, ElementNode, SortedElement } from './types';
import { isFieldProp } from './utils';
import { DimensionScalar } from '../../core/dist/trie';

/**
 * JSX factory function (automatic runtime)
 * Called as jsx(tag, props, key) by the automatic JSX transform.
 * Children are passed inside props.children, NOT as rest args.
 */
export function jsx(
  tag: string | Component,
  props: Record<string, unknown> | null,
  key?: string | number | null
): Element {
  const actualProps =
    key === undefined || key === null
      ? (props ?? {})
      : { ...(props ?? {}), key };
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
  by: Scalar<DimensionScalar[]> | DimensionScalar[];
  children: Field<readonly [DimensionScalar], Element>;
}): Element {
  const sortByField = isFieldProp(by) ? by : Field.pure(by);

  return new SortedElement(sortByField, children);
}
