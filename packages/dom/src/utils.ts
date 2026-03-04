import { Field, Scalar } from '@quon/core';
import { Element } from './types';

/**
 * Check if a value is a Field
 */
export function isFieldProp<T>(value: T | Scalar<T>): value is Scalar<T> {
  return value instanceof Field;
}

/**
 * Check if a value is a Field (for Element type)
 */
export function isFieldElement(value: Element): value is Field<[], Element> {
  return value instanceof Field;
}

/**
 * Check if a value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Flatten nested arrays
 */
export function flattenChildren(children: Element[]): Element[] {
  const result: Element[] = [];

  for (const child of children) {
    if (isArray(child)) {
      result.push(...flattenChildren(child));
    } else {
      result.push(child);
    }
  }

  return result;
}
