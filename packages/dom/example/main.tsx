import { useAtom, useEffect, useTimeout, use, useCast } from '@quon/core';
import { component, mount, jsx } from '../src/index';

// Counter component
const Counter = component(() => {
  const countAtom = useAtom<number>(0);

  const count = countAtom.map(v => `${v}!`);

  return (
    <div className="counter">
      <h2>Counter Example</h2>
      <p>
        Count: <strong>{count}</strong>
      </p>
      <button onClick={() => countAtom.modify(prev => prev + 1)}>
        Increment
      </button>
      <button onClick={() => countAtom.modify(prev => prev - 1)}>
        Decrement
      </button>
      <button onClick={() => countAtom.set(0)}>Reset</button>
    </div>
  );
});

// Input sync example
const InputSync = component(() => {
  const textAtom = useAtom<string>('Hello, Quon!');

  return (
    <div className="counter">
      <h2>Input Sync Example</h2>
      <p>
        You typed: <strong>{textAtom}</strong>
      </p>
      <input
        type="text"
        value={textAtom}
        onInput={(e: Event) =>
          textAtom.set((e.target as HTMLInputElement).value)
        }
      />
    </div>
  );
});

// Main App
const App = component(() => {
  return (
    <div>
      <Counter />
      <InputSync />
    </div>
  );
});

// Mount to DOM
const root = document.getElementById('root');
if (root) {
  const app = mount(App(), root);
  app.asMatter().materialize();
}
