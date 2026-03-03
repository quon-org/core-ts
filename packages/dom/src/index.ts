/**
 * @quon/dom - Reactive DOM library built on @quon/core
 */

// Re-export core Diagram utilities
export { toField } from '@quon/core';

// Export types
export type {
  Element,
  ElementNode,
  Props,
  RefCallback,
  Component,
  QuonIntrinsicElements,
} from './types';

// Export JSX factory and Fragment
export { jsx, Fragment, Sort } from './jsx';

// Export component helper
export { component } from './component';

// Export render function
export { useRender } from './render';

// Export mount function
export { mount } from './mount';

// Export utilities
export { isArray, flattenChildren } from './utils';
