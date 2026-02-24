import { Atom, Portal } from '@quon/core';
import { describe, expect, test } from 'vitest';
import { Sort, jsx } from './jsx';
import { mount } from './mount';
import { Element, ElementNode, SortedElement } from './types';

function makeTextElement(label: string): ElementNode {
  return new ElementNode('span', { 'data-label': label }, [label]);
}

function renderedLabels(parent: HTMLElement): string[] {
  return Array.from(parent.querySelectorAll('span')).map(node => {
    return node.textContent ?? '';
  });
}

describe('SortedElement rendering', () => {
  test('reorders DOM by Field<unknown[]> keys and applies latest update', () => {
    const parent = document.createElement('div');

    const a = makeTextElement('a');
    const b = makeTextElement('b');
    const c = makeTextElement('c');

    const elementsField = new Portal<Element>();
    const keysField = new Atom<unknown[]>([]);

    const app = mount(new SortedElement(keysField, elementsField), parent)
      .asMatter()
      .materialize();

    const pa = elementsField.connect(a).materialize();
    const pb = elementsField.connect(b).materialize();
    const pc = elementsField.connect(c).materialize();

    expect(renderedLabels(parent)).toEqual(['a', 'b', 'c']);

    keysField.set([c, a, b]);
    keysField.set([b, c, a]);

    expect(renderedLabels(parent)).toEqual(['b', 'c', 'a']);

    pa.vanish();
    pb.vanish();
    pc.vanish();
    app.vanish();
  });

  test('Sort unwraps JSX-style array child that contains a Field<Element>', () => {
    const parent = document.createElement('div');

    const a = makeTextElement('a');
    const b = makeTextElement('b');
    const c = makeTextElement('c');

    const elementsField = new Portal<Element>();
    const keysField = new Atom<unknown[]>([]);

    const sorted = Sort({
      by: keysField,
      children: [elementsField],
    });

    const app = mount(sorted, parent).asMatter().materialize();

    const pa = elementsField.connect(a).materialize();
    const pb = elementsField.connect(b).materialize();
    const pc = elementsField.connect(c).materialize();

    keysField.set([c, a, b]);

    expect(renderedLabels(parent)).toEqual(['c', 'a', 'b']);

    pa.vanish();
    pb.vanish();
    pc.vanish();
    app.vanish();
  });

  test('uses jsx key argument for Sort ordering', () => {
    const parent = document.createElement('div');

    const elementsField = new Portal<Element>();
    const keysField = new Atom<unknown[]>([]);

    const app = mount(
      Sort({
        by: keysField,
        children: [elementsField],
      }),
      parent
    )
      .asMatter()
      .materialize();

    const a = jsx('span', { children: ['a'] }, 1);
    const b = jsx('span', { children: ['b'] }, 2);
    const c = jsx('span', { children: ['c'] }, 3);

    const pa = elementsField.connect(a).materialize();
    const pb = elementsField.connect(b).materialize();
    const pc = elementsField.connect(c).materialize();

    keysField.set([3, 1, 2]);

    expect(renderedLabels(parent)).toEqual(['c', 'a', 'b']);

    pa.vanish();
    pb.vanish();
    pc.vanish();
    app.vanish();
  });
});
