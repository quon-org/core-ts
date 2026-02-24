import { use, useAtom, useCast, useEffect } from '@quon/core';
import {
  Element,
  ElementNode,
  Props,
  RefCallback,
  SortedElement,
} from './types';
import { isArray, flattenChildren, isFieldElement, isField } from './utils';

type SortedRenderedItem = {
  id: number;
  sortKey: unknown;
  start: Comment;
  end: Comment;
};

type SortedRenderState = {
  items: SortedRenderedItem[];
  nextId: number;
  boundaryEnd: Comment;
};

/**
 * Render an Element to a parent DOM node (Blueprint function)
 */
export function useRender(element: Element, parent: Node): void {
  useRenderInternal(element, parent, null);
}

/**
 * Render an Element before a specific node (Blueprint function)
 */
function useRenderBeforeNode(element: Element, beforeNode: Node): void {
  useRenderInternal(element, beforeNode.parentNode!, beforeNode);
}

/**
 * Helper to insert a node at the correct position
 * If beforeNode is null, it appends to the end of the parent
 */
function insertNode(parent: Node, node: Node, beforeNode: Node | null): void {
  if (beforeNode) {
    parent.insertBefore(node, beforeNode);
  } else {
    parent.appendChild(node);
  }
}

/**
 * Internal render function with optional beforeNode (Blueprint function)
 */
function useRenderInternal(
  element: Element,
  parent: Node,
  beforeNode: Node | null
): void {
  // Handle null/undefined
  if (element == null) {
    return;
  }

  // Handle Field<Element> (reactive component or reactive value)
  if (isFieldElement(element)) {
    // Create an anchor comment node to mark the position
    const anchor = useEffect(() => {
      return document.createComment('field-anchor-parent');
    });

    useEffect(addFinalizeFn => {
      insertNode(parent, anchor, beforeNode);
      addFinalizeFn(() => {
        anchor.remove();
      });
    });

    useCast(() => {
      // Add child anchor
      const childAnchor = useEffect(() =>
        document.createComment('field-anchor-child')
      );
      useEffect(addFinalizeFn => {
        insertNode(parent, childAnchor, anchor);
        addFinalizeFn(() => {
          childAnchor.remove();
        });
      });
      const el = use(element);
      useRenderBeforeNode(el, childAnchor);
    });
    return;
  }

  // Handle arrays
  if (isArray(element)) {
    const flattened = flattenChildren(element);
    for (const child of flattened) {
      useRenderInternal(child, parent, beforeNode);
    }
    return;
  }

  // Handle text nodes (string/number)
  if (typeof element === 'string' || typeof element === 'number') {
    const textNode = useEffect(() => {
      return document.createTextNode(String(element));
    });

    useEffect(addFinalizeFn => {
      insertNode(parent, textNode, beforeNode);

      addFinalizeFn(async () => {
        textNode.remove();
      });
    });
    return;
  }

  if (element instanceof SortedElement) {
    const revision = useAtom(0);

    const state = useEffect((): SortedRenderState => {
      return {
        items: [],
        nextId: 0,
        boundaryEnd: document.createComment('sorted-boundary-end'),
      };
    });

    useEffect(addFinalizeFn => {
      insertNode(parent, state.boundaryEnd, beforeNode);

      addFinalizeFn(() => {
        state.boundaryEnd.remove();
      });
    });

    useCast(() => {
      const itemValue = use(element.elementsField);
      const itemSortKey = resolveSortKey(itemValue);
      const itemStart = useEffect(() =>
        document.createComment('sorted-item-start')
      );
      const itemEnd = useEffect(() =>
        document.createComment('sorted-item-end')
      );
      const itemId = useEffect(() => {
        const id = state.nextId;
        state.nextId += 1;
        return id;
      });

      useEffect(addFinalizeFn => {
        insertNode(parent, itemStart, state.boundaryEnd);
        insertNode(parent, itemEnd, state.boundaryEnd);

        const item: SortedRenderedItem = {
          id: itemId,
          sortKey: itemSortKey,
          start: itemStart,
          end: itemEnd,
        };
        state.items.push(item);
        revision.modify(val => val + 1);

        addFinalizeFn(() => {
          const index = state.items.findIndex(
            existing => existing.id === itemId
          );
          if (index >= 0) {
            state.items.splice(index, 1);
            revision.modify(val => val + 1);
          }

          itemStart.remove();
          itemEnd.remove();
        });
      });

      useRenderBeforeNode(itemValue as Element, itemEnd);
    });

    const sortByField = element.sortBy;
    useCast(() => {
      use(revision);
      const keys = use(sortByField);
      useEffect(() => {
        const ordered = orderItemsByKeys(state.items, keys);
        applySortedDomOrder(parent, ordered, state.boundaryEnd);
      });
    });

    return;
  }

  if (element instanceof ElementNode) {
    // Extract values before any Blueprint calls
    const tag = element.tag;
    const props = element.props;
    const children = element.children;

    const domElement = useEffect(() => {
      return document.createElement(tag);
    });

    // Apply props
    useApplyProps(domElement, props);

    // Append to parent
    useEffect(addFinalizeFn => {
      insertNode(parent, domElement, beforeNode);

      addFinalizeFn(async () => {
        domElement.remove();
      });
    });

    // Render children
    for (const child of children) {
      useRenderInternal(child, domElement, null);
    }
    return;
  }

  useEffect(() => {
    console.warn('useRenderInternal: unknown element', element);
  });
}

/**
 * Apply props to a DOM element (Blueprint function)
 */
function useApplyProps(element: HTMLElement, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    // Skip special props
    if (key === 'children' || key === 'key') {
      continue;
    }

    // Handle ref
    if (key === 'ref' && typeof value === 'function') {
      useEffect(() => {
        (value as RefCallback)(element);
      });
      continue;
    }

    // Handle event listeners (onClick, onInput, etc.)
    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      useEffect(addFinalizeFn => {
        const handler = value as EventListener;
        element.addEventListener(eventName, handler);

        addFinalizeFn(async () => {
          element.removeEventListener(eventName, handler);
        });
      });
      continue;
    }

    // Handle reactive Field values
    if (isField(value)) {
      useCast(() => {
        const val = use(value);
        useEffect(addFinalizeFn => {
          setProp(element, key, val);
          addFinalizeFn(() => {
            setProp(element, key, undefined);
          });
        });
      });
      continue;
    }

    // Handle static values
    useEffect(() => {
      setProp(element, key, value);
    });
  }
}

/**
 * Set a property or attribute on an element
 */
function setProp(element: HTMLElement, key: string, value: unknown): void {
  if (value == null) {
    return;
  }

  // Special handling for certain properties
  if (key === 'className') {
    element.className = String(value);
    return;
  }

  if (key === 'style' && typeof value === 'object') {
    Object.assign(element.style, value);
    return;
  }

  // Try to set as property first
  if (key in element) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (element as any)[key] = value;
      return;
    } catch {
      // If property assignment fails, fall through to setAttribute
    }
  }

  // Set as attribute
  if (typeof value === 'boolean') {
    if (value) {
      element.setAttribute(key, '');
    } else {
      element.removeAttribute(key);
    }
  } else {
    element.setAttribute(key, String(value));
  }
}

function orderItemsByKeys(
  items: readonly SortedRenderedItem[],
  keys: readonly unknown[]
): SortedRenderedItem[] {
  const rank = new Map<unknown, number>();

  for (let i = 0; i < keys.length; i += 1) {
    if (!rank.has(keys[i])) {
      rank.set(keys[i], i);
    }
  }

  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.sortKey);
    const rightRank = rank.get(right.sortKey);

    if (leftRank === undefined && rightRank === undefined) {
      return left.id - right.id;
    }

    if (leftRank === undefined) {
      return 1;
    }

    if (rightRank === undefined) {
      return -1;
    }

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.id - right.id;
  });
}

function resolveSortKey(value: unknown): unknown {
  if (value instanceof ElementNode) {
    return value.props.key ?? value;
  }

  return value;
}

function applySortedDomOrder(
  parent: Node,
  orderedItems: readonly SortedRenderedItem[],
  boundaryEnd: Node
): void {
  for (let i = 0; i < orderedItems.length; i += 1) {
    const item = orderedItems[i];
    if (item) {
      moveRangeBefore(parent, item.start, item.end, boundaryEnd);
    }
  }
}

function moveRangeBefore(
  parent: Node,
  start: Node,
  end: Node,
  beforeNode: Node
): void {
  let current: Node | null = start;

  while (current) {
    const next: Node | null = current.nextSibling;
    parent.insertBefore(current, beforeNode);

    if (current === end) {
      break;
    }

    current = next;
  }
}
