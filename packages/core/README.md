# @quon/core

A lightweight reactive programming library built around **Field**, **Operator**, and **Atom** - providing a declarative API for managing reactive state and side effects with automatic cleanup.

## Features

- **Field<T>**: Represents a reactive source of values that couples listeners via Operator.
- **Operator<T>**: Represents a lifecycle object (exicite/decay).
- **Diagram DSL**: Synchronous-style syntax for composing Fields and Operators.
- **Atom<T>**: Managed single-value state container.
- **Bridge<T>**: Dynamic multi-value state container.
- **Cluster<T>**: Dynamic set-based state container.
- **Automatic Cleanup**: Resources are released in proper order automatically.

## Installation

```bash
npm install @quon/core
```

## Quick Start

```typescript
import {
  toField,
  useAtom,
  useCast,
  useInteraction,
  useTimeout,
  use,
} from '@quon/core';

const counterApp = () => {
  // Create an atom (state)
  const count = useAtom(0);

  // Cast the atom into a Field and observe changes
  useCast(() => {
    const value = use(count);
    useInteraction(() => {
      console.log('Count:', value);
    });
  });

  // Update count after 1 second
  useTimeout(1000);
  useInteraction(() => count.set(1));

  useTimeout(1000);
  useInteraction(() => count.set(2));
};

// Execute the diagram
const app = toField(counterApp).asOperator().exicite();

// Later: cleanup
// await app.decay();
```

## Core Concepts

### Field<T>

`Field<T>` represents a reactive source of values. It couples listeners to emitted values through Operator.

```typescript
// Transform values
const doubled = field.map(x => x * 2);

// Filter values
const evens = field.filter(x => x % 2 === 0);

// Append (merge) fields
const merged = field1.append(field2);
```

### Operator<T>

`Operator<T>` represents an object with a lifecycle (exicite/decay). Diagrams are compiled into Operators via Fields.

```typescript
const operator = new Interaction<string>(addFinalizeFn => {
  addFinalizeFn(() => console.log('cleanup'));
  return 'hello';
});
const { result, decay } = operator.exicite();

// ... later
await decay();
```

### Diagram

`Diagram` is a synchronous-style DSL for composing Fields and Operators.

```typescript
import { toField, useAtom, useInteraction } from '@quon/core';

const myDiagram = () => {
  const atom = useAtom(0);

  // Side effects must be wrapped in useInteraction
  useInteraction(() => {
    console.log('Atom created');
  });
};

const app = toField(myDiagram).asOperator().exicite();
```

### Atom<T>

`Atom<T>` is a `Field<T>` that holds a single current value. It is similar to a "cell" or "signal" in other libraries.

```typescript
const count = useAtom(0);

// Update value
useInteraction(() => count.set(1));

// Modify based on previous value
useInteraction(() => count.modify(prev => prev + 1));
```

### Bridge<T>

`Bridge<T>` is a `Field<T>` that allows dynamic connections. It represents a collection of values where items can be added or removed dynamically.

```typescript
const bridge = useBridge<string>();

// Connect a value to the bridge
useConnection(bridge, 'Hello');
```

### Cluster<T>

`Cluster<T>` is a `Field<T>` that manages a set of values by identity. Values can be added and removed directly.

```typescript
const cluster = useCluster<number>();

useInteraction(() => cluster.add(1));
useInteraction(() => cluster.add(2));
useInteraction(() => cluster.remove(1));
```

## API Reference

### Top-Level Exports

- **`toField<T>(diagram: () => T): Field<T>`**
  - Converts a Diagram function into a Field.

- **`use<T>(field: Field<T>): T`**
  - Uses a Field within a Diagram.

- **`useInteraction<T>(maker: (addFinalizeFn, abortSignal) => T): T`**
  - Executes a side effect with cleanup.

- **`useTimeout(delayMs: number): void`**
  - Pauses execution for a specified duration.

- **`useAtom<T>(initialValue: T): Atom<T>`**
  - Creates a managed single-value state.

- **`useBridge<T>(): Bridge<T>`**
  - Creates a dynamic multi-value state.

- **`useCluster<T>(): Cluster<T>`**
  - Creates a dynamic set-based state.

- **`useConnection<T>(bridge: Bridge<T>, val: T): void`**
  - Connects a value to a Bridge.

- **`useCast<T>(diagram: () => T): Field<T>`**
  - Casts a Diagram into a Field by running it inside a Bridge.

- **`useAppended<T>(left: () => T, right: () => T): T`**
  - Runs two Diagrams in parallel.

- **`useConcatenated<T>(diagrams: (() => T)[]): T`**
  - Runs multiple Diagrams sequentially.

- **`createContext<T>(): Context<T>`**
  - Creates a context for dependency injection.

### Classes

- **`Field<T>`**
  - `couple(listener: (val: T) => Operator<void>): Operator<void>`
  - `asOperator(): Operator<void>`
  - `map<U>(fn: (val: T) => U): Field<U>`
  - `flatMap<U>(fn: (val: T) => Field<U>): Field<U>`
  - `filter(predicate: (val: T) => boolean): Field<T>`
  - `append(other: Field<T>): Field<T>`
  - `static concat<T>(fields: Field<T>[]): Field<T>`
  - `static pure<T>(val: T): Field<T>`
  - `static ofOperator<T>(operator: Operator<T>): Field<T>`

- **`Operator<T>`**
  - `exicite(): Excitation<T>`
  - `map<U>(fn: (result: T) => U): Operator<U>`
  - `flatMap<U>(fn: (result: T) => Operator<U>): Operator<U>`
  - `parZip<U>(other: Operator<U>): Operator<[T, U]>`
  - `static pure<T>(value: T): Operator<T>`
  - `static parSequence<T>(operators: Operator<T>[]): Operator<T[]>`
  - `static ofClass<T>(Cls: ExcitationClass<T>): Operator<T>`

- **`Interaction<T>` extends `Operator<T>`**
  - Constructor: `new Interaction<T>((addFinalizeFn, abortSignal) => T | Promise<T>)`

## License

MIT
