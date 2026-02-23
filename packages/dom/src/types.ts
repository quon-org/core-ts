import { Field } from "@quon/core";

/**
 * Element type - the core type representing DOM elements in the library
 */
export type Element = ElementPrimitive | ElementArray;

type ElementPrimitive =
  | Field<Element> // Component (Blueprint-based) or reactive value
  | SortedElementStore
  | ElementNode // DOM element description
  | string // Text node
  | number // Text node
  | null
  | undefined;

/** Array of Elements (interface to break circular type reference) */
export interface ElementArray extends Array<Element> {}

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

export class SortedElementStore {
  keysField: Field<unknown[]>;
  elementsField: Field<Element>;

  constructor(
    keysField: Field<unknown[]>,
    elementsField: Field<Element>
  ) {
    this.keysField = keysField;
    this.elementsField = elementsField;
  }
}

/**
 * Props type - supports both static values and reactive Field values
 */
export type Props = {
  [key: string]: unknown | Field<unknown>;
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
 * Helper type to allow Field values for a given type
 */
export type MaybeReactive<T> = T | Field<T>;

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
  namespace JSX {
    interface IntrinsicElements extends QuonIntrinsicElements {}
    interface ElementAttributesProperty {
      props: unknown;
    }
    interface ElementChildrenAttribute {
      children: unknown;
    }
    type Element = import("./types").Element;
  }
}
