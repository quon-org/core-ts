import { useAtom, useEnsemble } from '@quon/core';
import { component, mount, Sort } from '../src/index';

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

// Input sync example
const TodoList = component(() => {
  const todos = useEnsemble<{ id: number; text: string }>();
  const newTodoText = useAtom<string>('');
  const todoOrder = useAtom<unknown[]>([]);

  const addTodo = (): void => {
    if (newTodoText.peek().trim() === '') return;
    const todo = { id: Date.now(), text: newTodoText.peek() };
    todos.add(todo);
    todoOrder.modify(prev => [todo.id, ...prev]);
    newTodoText.set('');
  };

  const removeTodo = (id: number): void => {
    todos.removeIf(todo => todo.id === id);
    todoOrder.modify(prev => prev.filter(key => key !== id));
  };

  return (
    <div className="counter">
      <h2>Todo List Example</h2>
      <input
        type="text"
        value={newTodoText}
        onInput={(e: Event) =>
          newTodoText.set((e.target as HTMLInputElement).value)
        }
      />
      <button onClick={addTodo}>Add Todo</button>
      <ul>
        <Sort by={todoOrder}>
          {todos.map(todo => (
            <li key={todo.id}>
              {todo.text}{' '}
              <button onClick={() => removeTodo(todo.id)}>Remove</button>
            </li>
          ))}
        </Sort>
      </ul>
    </div>
  );
});

// Main App
const App = component(() => {
  return (
    <div>
      <Counter />
      <InputSync />
      <TodoList />
    </div>
  );
});

// Mount to DOM
const root = document.getElementById('root');
if (root) {
  const app = mount(App({}), root);
  app.asMatter().materialize();
}
