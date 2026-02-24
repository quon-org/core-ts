# Quon

A reactive programming library for TypeScript with automatic lifecycle management.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [@quon/core](./packages/core/) | Core reactive primitives (Field, Matter, Blueprint DSL) | 0.5.1 |
| [@quon/dom](./packages/dom/) | Reactive DOM rendering with JSX support | 0.1.0 |

## Quick Start

```bash
npm install @quon/core @quon/dom
```

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
app.asMatter().materialize();
```

## Development

```bash
pnpm install
pnpm run build
pnpm test
pnpm run lint
pnpm run format
```

## License

MIT
