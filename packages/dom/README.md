# @quon/dom

Reactive DOM library built on [@quon/core](../core/). Provides JSX support, reactive rendering, and component composition with automatic lifecycle management.

## Installation

```bash
npm install @quon/dom @quon/core
```

## Setup

### TypeScript / JSX Configuration

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@quon/dom",
  },
}
```

## Quick Start

```tsx
import { useAtom } from '@quon/core';
import { component, mount } from '@quon/dom';

const Counter = component(() => {
  const count = useAtom(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count.modify(n => n + 1)}>+1</button>
    </div>
  );
});

const app = mount(<Counter />, document.getElementById('root')!);
app.asOperator().exicite();
```

## API

### `mount(element, parent)`

Mounts an Element to a DOM node and returns a `Field<void>` managing the rendering lifecycle.

```tsx
const app = mount(<App />, document.getElementById('root')!);
const { decay } = app.asOperator().exicite();

// Unmount:
await decay();
```

### `component(diagram)`

Wraps a Diagram function into a reusable JSX component.

```tsx
const Greeting = component<{ name: string }>(props => {
  return <h1>Hello, {props.name}!</h1>;
});

// Use in JSX:
<Greeting name="World" />;
```

### `useRender(element, parent)`

Diagram function that renders an Element into a DOM node. Use this inside `toField()` for lower-level control.

### Reactive Props

Props can accept `Field<T>` values for reactive updates without re-rendering the component:

```tsx
const count = useAtom(0);

// Field<string> is accepted as a prop value — updates the DOM directly
<p className={count.map(n => (n > 5 ? 'high' : 'low'))}>Count: {count}</p>;
```

### `Sort`

Renders children in a dynamic order controlled by a reactive key array:

```tsx
const order = useAtom([3, 1, 2]);
const items = useCluster<{ id: number; text: string }>();

<ul>
  <Sort by={order}>
    {items.map(item => (
      <li key={item.id}>{item.text}</li>
    ))}
  </Sort>
</ul>;
```

### `Fragment`

Standard JSX fragment support:

```tsx
<>
  <div>A</div>
  <div>B</div>
</>
```

## License

MIT
