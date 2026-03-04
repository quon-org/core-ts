import { Field, Scalar } from '@quon/core';
import { DimensionScalar, ZeroDimension } from '../../core/dist/trie';

/**
 * Element type - the core type representing DOM elements in the library
 */
export type Element =
  | Field<ZeroDimension, Element> // Component (Diagram-based) or reactive value
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
  sortBy: Scalar<DimensionScalar[]>;
  elementsField: Field<readonly [DimensionScalar], Element>;

  constructor(
    sortBy: Scalar<DimensionScalar[]>,
    elementsField: Field<readonly [DimensionScalar], Element>
  ) {
    this.sortBy = sortBy;
    this.elementsField = elementsField;
  }
}

/**
 * Helper type to allow Field values for a given type
 */
export type MaybeScalar<T> = T | Scalar<T>;

/**
 * Props type - supports both static values and reactive Field values
 */
export type Props = {
  [key: string]: MaybeScalar<unknown>;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Component<P = any> = (props: P) => Element;

/**
 * JSX intrinsic elements - maps HTML tag names to their props
 */
export type QuonIntrinsicElements = {
  [K in keyof HTMLElementTagNameMap]: {
    ref?: RefCallback;
    children?: Element | Element[];
    // Mouse events
    onClick?: (e: MouseEvent) => void;
    onDblClick?: (e: MouseEvent) => void;
    onMouseDown?: (e: MouseEvent) => void;
    onMouseUp?: (e: MouseEvent) => void;
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: (e: MouseEvent) => void;
    onContextMenu?: (e: MouseEvent) => void;
    // Keyboard events
    onKeyDown?: (e: KeyboardEvent) => void;
    onKeyUp?: (e: KeyboardEvent) => void;
    // Focus events
    onFocus?: (e: FocusEvent) => void;
    onBlur?: (e: FocusEvent) => void;
    // Input events
    onInput?: (e: Event) => void;
    onChange?: (e: Event) => void;
    // Form events
    onSubmit?: (e: SubmitEvent) => void;
    // Drag events
    onDragStart?: (e: DragEvent) => void;
    onDragEnd?: (e: DragEvent) => void;
    onDragOver?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent) => void;
    // Pointer events
    onPointerDown?: (e: PointerEvent) => void;
    onPointerUp?: (e: PointerEvent) => void;
    onPointerMove?: (e: PointerEvent) => void;
    // Touch events
    onTouchStart?: (e: TouchEvent) => void;
    onTouchEnd?: (e: TouchEvent) => void;
    onTouchMove?: (e: TouchEvent) => void;
    // Scroll events
    onScroll?: (e: Event) => void;
    // Props can be reactive Field values
    value?: MaybeScalar<string>;
    checked?: MaybeScalar<boolean>;
    disabled?: MaybeScalar<boolean>;
    className?: MaybeScalar<string>;
    style?: MaybeScalar<string | Partial<CSSStyleDeclaration>>;
    // Allow any other props with Field support
    [key: string]: unknown | Scalar<unknown>;
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
