import { Atom, Bridge } from '@quon/core';
import { describe, expect, test } from 'vitest';
import { Sort, jsx } from '../src/jsx';
import { mount } from '../src/mount';
import { Element, ElementNode, SortedElement } from '../src/types';

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

    const elementsField = new Bridge<Element>();
    const keysField = new Atom<unknown[]>([]);

    const app = mount(new SortedElement(keysField, elementsField), parent)
      .asOperator()
      .exicite();

    const pa = elementsField.connect(a).exicite();
    const pb = elementsField.connect(b).exicite();
    const pc = elementsField.connect(c).exicite();

    expect(renderedLabels(parent)).toEqual(['a', 'b', 'c']);

    keysField.set([c, a, b]);
    keysField.set([b, c, a]);

    expect(renderedLabels(parent)).toEqual(['b', 'c', 'a']);

    pa.decay();
    pb.decay();
    pc.decay();
    app.decay();
  });

  test('Sort unwraps JSX-style array child that contains a Field<Element>', () => {
    const parent = document.createElement('div');

    const a = makeTextElement('a');
    const b = makeTextElement('b');
    const c = makeTextElement('c');

    const elementsField = new Bridge<Element>();
    const keysField = new Atom<unknown[]>([]);

    const sorted = Sort({
      by: keysField,
      children: [elementsField],
    });

    const app = mount(sorted, parent).asOperator().exicite();

    const pa = elementsField.connect(a).exicite();
    const pb = elementsField.connect(b).exicite();
    const pc = elementsField.connect(c).exicite();

    keysField.set([c, a, b]);

    expect(renderedLabels(parent)).toEqual(['c', 'a', 'b']);

    pa.decay();
    pb.decay();
    pc.decay();
    app.decay();
  });

  test('uses jsx key argument for Sort ordering', () => {
    const parent = document.createElement('div');

    const elementsField = new Bridge<Element>();
    const keysField = new Atom<unknown[]>([]);

    const app = mount(
      Sort({
        by: keysField,
        children: [elementsField],
      }),
      parent
    )
      .asOperator()
      .exicite();

    const a = jsx('span', { children: ['a'] }, 1);
    const b = jsx('span', { children: ['b'] }, 2);
    const c = jsx('span', { children: ['c'] }, 3);

    const pa = elementsField.connect(a).exicite();
    const pb = elementsField.connect(b).exicite();
    const pc = elementsField.connect(c).exicite();

    keysField.set([3, 1, 2]);

    expect(renderedLabels(parent)).toEqual(['c', 'a', 'b']);

    pa.decay();
    pb.decay();
    pc.decay();
    app.decay();
  });
});
