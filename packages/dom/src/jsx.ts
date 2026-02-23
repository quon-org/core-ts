import { Field } from "@quon/core";
import { Element, Component, ElementNode, SortedElementStore } from "./types";
import { isField } from "./utils";

/**
 * JSX factory function
 * This is called by TypeScript when JSX is transformed
 */
export function jsx(
  tag: string | Component,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Element {
  const actualProps = props ?? {};
  const actualChildren = flattenChildren(children);

  // If tag is a function (component), call it and return the Field<Element>
  if (typeof tag === "function") {
    return tag({ ...actualProps, children: actualChildren });
  }

  // If tag is a string, create an ElementNode
  return new ElementNode(tag, actualProps, actualChildren);
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
  keys,
  children,
}: {
  keys: Field<unknown[]> | unknown[];
  children: Field<Element>;
}) {
  return new SortedElementStore(
    isField(keys) ? keys : Field.pure(keys),
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
