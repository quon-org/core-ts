import { Atom, Field } from '@quon/core';
import { describe, expect, test } from 'vitest';
import { jsx, Fragment } from '../src/jsx';
import { mount } from '../src/mount';
import { Component, ElementNode } from '../src/types';

describe('mount', () => {
  test('renders a text string', () => {
    const parent = document.createElement('div');
    const app = mount('hello', parent).asOperator().exicite();
    expect(parent.textContent).toBe('hello');
    app.decay();
  });

  test('renders a number', () => {
    const parent = document.createElement('div');
    const app = mount(42, parent).asOperator().exicite();
    expect(parent.textContent).toBe('42');
    app.decay();
  });

  test('renders null without error', () => {
    const parent = document.createElement('div');
    const app = mount(null, parent).asOperator().exicite();
    expect(parent.childNodes.length).toBe(0);
    app.decay();
  });

  test('renders undefined without error', () => {
    const parent = document.createElement('div');
    const app = mount(undefined, parent).asOperator().exicite();
    expect(parent.childNodes.length).toBe(0);
    app.decay();
  });
});

describe('useRender with ElementNode', () => {
  test('renders a simple element', () => {
    const parent = document.createElement('div');
    const el = new ElementNode('span', {}, ['text']);
    const app = mount(el, parent).asOperator().exicite();

    expect(parent.innerHTML).toBe('<span>text</span>');
    app.decay();
  });

  test('renders nested elements', () => {
    const parent = document.createElement('div');
    const el = new ElementNode('div', { className: 'outer' }, [
      new ElementNode('span', {}, ['inner']),
    ]);
    const app = mount(el, parent).asOperator().exicite();

    expect(parent.querySelector('.outer')).not.toBeNull();
    expect(parent.querySelector('.outer span')?.textContent).toBe('inner');
    app.decay();
  });

  test('applies static props', () => {
    const parent = document.createElement('div');
    const el = new ElementNode('input', { type: 'text', value: 'hello' }, []);
    const app = mount(el, parent).asOperator().exicite();

    const input = parent.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.value).toBe('hello');
    app.decay();
  });

  test('cleans up DOM on decay', async () => {
    const parent = document.createElement('div');
    const el = new ElementNode('span', {}, ['text']);
    const app = mount(el, parent).asOperator().exicite();

    expect(parent.childNodes.length).toBeGreaterThan(0);
    await app.decay();
    expect(parent.querySelector('span')).toBeNull();
  });
});

describe('useRender with arrays', () => {
  test('renders an array of elements', () => {
    const parent = document.createElement('div');
    const el = [
      new ElementNode('span', {}, ['a']),
      new ElementNode('span', {}, ['b']),
    ];
    const app = mount(el, parent).asOperator().exicite();

    const spans = parent.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0]?.textContent).toBe('a');
    expect(spans[1]?.textContent).toBe('b');
    app.decay();
  });
});

describe('useRender with Field<Element>', () => {
  test('renders reactive Field values', () => {
    const parent = document.createElement('div');
    const atom = new Atom<string>('initial');

    const app = mount(atom, parent).asOperator().exicite();
    expect(parent.textContent).toContain('initial');

    atom.set('updated');
    expect(parent.textContent).toContain('updated');

    app.decay();
  });
});

describe('useRender with event listeners', () => {
  test('attaches and removes event listeners', () => {
    const parent = document.createElement('div');
    let clicked = false;
    const el = new ElementNode('button', { onClick: () => (clicked = true) }, [
      'click me',
    ]);
    const app = mount(el, parent).asOperator().exicite();

    const button = parent.querySelector('button') as HTMLButtonElement;
    button.click();
    expect(clicked).toBe(true);

    app.decay();
  });
});

describe('useRender with reactive props', () => {
  test('updates props reactively via Field', () => {
    const parent = document.createElement('div');
    const classAtom = new Atom('initial');
    const el = new ElementNode('div', { className: classAtom }, ['content']);
    const app = mount(el, parent).asOperator().exicite();

    const div = parent.querySelector('div') as HTMLDivElement;
    expect(div.className).toBe('initial');

    classAtom.set('updated');
    expect(div.className).toBe('updated');

    app.decay();
  });
});

describe('jsx factory', () => {
  test('creates ElementNode for string tags', () => {
    const el = jsx('div', { className: 'test', children: ['hello'] });
    expect(el).toBeInstanceOf(ElementNode);
    const node = el as ElementNode;
    expect(node.tag).toBe('div');
    expect(node.props.className).toBe('test');
  });

  test('calls function components', () => {
    const MyComponent = (props: { name: string }): string => {
      return `Hello, ${props.name}!`;
    };
    const el = jsx(MyComponent, { name: 'World' });
    expect(el).toBe('Hello, World!');
  });
});

describe('Fragment', () => {
  test('returns children as array', () => {
    const children = [
      new ElementNode('span', {}, ['a']),
      new ElementNode('span', {}, ['b']),
    ];
    const result = Fragment({ children });
    expect(result).toBe(children);
  });

  test('returns empty array when no children', () => {
    const result = Fragment({});
    expect(result).toEqual([]);
  });
});

describe('component helper', () => {
  test('wraps diagram into a Field-returning function', async () => {
    const { component } = await import('../src/component');

    const MyComp = component(() => {
      return new ElementNode('div', {}, ['hello from component']);
    });

    const parent = document.createElement('div');
    const el = MyComp();
    const app = mount(el, parent).asOperator().exicite();

    expect(parent.querySelector('div')?.textContent).toBe(
      'hello from component'
    );
    app.decay();
  });
});

describe('ref callback', () => {
  test('calls ref with DOM element', () => {
    const parent = document.createElement('div');
    let refElement: HTMLElement | null = null;
    const el = new ElementNode(
      'div',
      { ref: (el: HTMLElement) => (refElement = el) },
      []
    );
    const app = mount(el, parent).asOperator().exicite();

    expect(refElement).not.toBeNull();
    expect(refElement).toBeInstanceOf(HTMLDivElement);
    app.decay();
  });
});
