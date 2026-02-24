import { Field } from '@quon/core';

/**
 * Element type - the core type representing DOM elements in the library
 */
export type Element =
  | Field<Element> // Component (Blueprint-based) or reactive value
  | SortedElement
  | ElementNode // DOM element description
  | string // Text node
  | number // Text node (number)
  | null // Null/undefined (renders nothing)
  | undefined
  | Array<Element>; // Array of elements (for fragments or multiple children)

/**
 * ElementNode represents a DOM element with tag, props, and children
 */
export class ElementNode {
  tag: string;
  props: Props;
  children: Element[];

  constructor(tag: string, props: Props, children: Element[]) {
    this.tag = tag;
    this.props = props;
    this.children = children;
  }
}

export class SortedElement {
  sortBy: Field<unknown[]>;
  elementsField: Field<Element>;

  constructor(sortBy: Field<unknown[]>, elementsField: Field<Element>) {
    this.sortBy = sortBy;
    this.elementsField = elementsField;
  }
}

/**
 * Helper type to allow Field values for a given type
 */
export type MaybeReactive<T> = T | Field<T>;

/**
 * Props type - supports both static values and reactive Field values
 */
export type Props = {
  [key: string]: MaybeReactive<unknown>;
  ref?: RefCallback;
  key?: string | number;
};

/**
 * Ref callback - called when the element is created
 */
export type RefCallback = (element: HTMLElement) => void;

/**
 * Component function type - returns an Element
 */
export type Component<P = Record<string, unknown>> = (props: P) => Element;

/**
 * JSX intrinsic elements - maps HTML tag names to their props
 */
export type QuonIntrinsicElements = {
  [K in keyof HTMLElementTagNameMap]: {
    ref?: RefCallback;
    key?: string | number;
    children?: Element | Element[];
    // Event handlers (functions only)
    onClick?: EventListener;
    onInput?: EventListener;
    onChange?: EventListener;
    onSubmit?: EventListener;
    onKeyDown?: EventListener;
    onKeyUp?: EventListener;
    onFocus?: EventListener;
    onBlur?: EventListener;
    // Props can be reactive Field values
    value?: MaybeReactive<string>;
    checked?: MaybeReactive<boolean>;
    disabled?: MaybeReactive<boolean>;
    className?: MaybeReactive<string>;
    style?: MaybeReactive<string | Partial<CSSStyleDeclaration>>;
    // Allow any other props with Field support
    [key: string]: unknown | Field<unknown>;
  };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type IntrinsicElements = QuonIntrinsicElements;
    interface ElementAttributesProperty {
      props: unknown;
    }
    interface ElementChildrenAttribute {
      children: unknown;
    }
    type Element = import('./types').Element;
  }
}
