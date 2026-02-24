import { Field, toField, use, useCast, useEffect, useLatest } from '@quon/core';
import {
  Element,
  ElementNode,
  Props,
  RefCallback,
  SortedElement,
} from './types';
import { isArray, flattenChildren, isFieldElement, isField } from './utils';

/**
 * Render an Element to a parent DOM node (Blueprint function)
 */
export function useRender(element: Element, parent: Node): void {
  useRenderInternal(element, parent, Field.empty());
}

/**
 * Helper to insert a node at the correct position
 * If beforeNode is null, it appends to the end of the parent
 */
function insertNode(node: Node, parent: Node, beforeNode: Node | null): void {
  if (beforeNode) {
    parent.insertBefore(node, beforeNode);
  } else {
    parent.appendChild(node);
  }
}

function useInsertNode(
  nodeField: Field<ChildNode>, // 描画対象の Node
  parent: Node,
  beforeNodeField: Field<Node> // 最も最後に渡された Node を優先, Node が無い場合は親の最後に追加
): void {
  const latestBeforeNodeField = useLatest(beforeNodeField, null);

  useCast(() => {
    // それぞれの node に対して
    const node = use(nodeField);
    // beforeNode が更新されるたび、そこに移動する
    // nodeField 内の Node については順番は保証できない (保証したいなら Sort を使うべき)
    const latestBeforeNode = use(latestBeforeNodeField);
    useEffect(() => {
      insertNode(node, parent, latestBeforeNode); // 移動するだけ (戻したりはしない)
    });
  });
}

/**
 * 与えられた配列の要素ごとに Anchor Node を beforeNode の前に作成して返す
 * 個数の更新、beforeNode の更新に反応して **すべての Anchor Node** を作り直す
 * 順番を保証する場合は blueprint の繰り返しではなくその内部でやる必要がある。
 */
function useAnchorNodes<K>(
  countField: Field<K[]>,
  parent: Node,
  beforeNodeField: Field<Node>
): Field<
  {
    key: K;
    anchor: Comment;
  }[]
> {
  const latestBeforeNodeField = useLatest(beforeNodeField, null);
  return useCast(() => {
    const keys = use(countField);
    const latestBeforeNode = use(latestBeforeNodeField);
    const anchors = useEffect(() => {
      return keys.map(key => {
        const anchor = document.createComment(`anchor-${String(key)}`);
        insertNode(anchor, parent, latestBeforeNode);
        return { key, anchor };
      });
    });

    useEffect(addFinalizeFn => {
      addFinalizeFn(() => {
        for (const { anchor } of anchors) {
          anchor.remove();
        }
      });
    });

    return anchors;
  });
}

/**
 * Internal render function with optional beforeNode (Blueprint function)
 */
function useRenderInternal(
  element: Element,
  parent: Node,
  beforeNode: Field<Node>
): void {
  // Handle null/undefined
  if (element == null) {
    return;
  }

  // Handle Field<Element> (reactive component or reactive value)
  if (isFieldElement(element)) {
    useCast(() => {
      const fieldValue = use(element);
      useRenderInternal(fieldValue, parent, beforeNode);
    });
    return;
  }

  // Handle arrays
  if (isArray(element)) {
    const flattened = flattenChildren(element);
    // それぞれの Element について Anchor Node を生成
    const anchorsField = useAnchorNodes(
      Field.pure(flattened),
      parent,
      beforeNode
    );
    // それぞれの Element を対応する Anchor Node の前に描画
    useCast(() => {
      const anchors = use(anchorsField);
      for (const { key: element, anchor } of anchors) {
        useRenderInternal(element, parent, Field.pure(anchor));
      }
    });
    return;
  }

  // Handle text nodes (string/number)
  if (typeof element === 'string' || typeof element === 'number') {
    const textNode = useEffect(() => {
      return document.createTextNode(String(element));
    });

    useEffect(addFinalizeFn => {
      addFinalizeFn(async () => {
        textNode.remove();
      });
    });

    useInsertNode(Field.pure(textNode), parent, beforeNode);

    return;
  }

  if (element instanceof SortedElement) {
    const sortByField = element.sortBy;
    const elementsField = element.elementsField;

    // sortByField に基づいて anchor を設置
    const anchorsField = useAnchorNodes(sortByField, parent, beforeNode);

    // key に対して beforeNode を取得する関数
    const getBeforeNodeField = (key: unknown): Field<Node> =>
      toField(() => {
        const anchors = use(anchorsField);
        const anchor = anchors.find(({ key: k }) => k === key)?.anchor;
        return use(anchor ? Field.pure(anchor) : Field.empty());
      });

    // それぞれの Element を描画
    useCast(() => {
      const element = use(elementsField);
      useRenderInternal(
        element,
        parent,
        getBeforeNodeField(resolveSortKey(element))
      );
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
    // Append to parent
    useEffect(addFinalizeFn => {
      addFinalizeFn(async () => {
        domElement.remove();
      });
    });

    // Apply props
    useApplyProps(domElement, props);

    useInsertNode(Field.pure(domElement), parent, beforeNode);

    // Render children
    for (const child of children) {
      useRenderInternal(child, domElement, Field.empty());
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

function resolveSortKey(value: unknown): unknown {
  if (value instanceof ElementNode) {
    return value.props.key ?? value;
  }

  return value;
}
