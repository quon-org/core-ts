# @quon/core

A lightweight reactive programming library built around **Field**, **Matter**, and **Atom** - providing a declarative API for managing reactive state and side effects with automatic cleanup.

## Features

- **Field<T>**: Represents a reactive source of values that couples listeners via Matter.
- **Matter<T>**: Represents a lifecycle object (materialize/vanish).
- **Blueprint DSL**: Synchronous-style syntax for composing Fields and Matters.
- **Atom<T>**: Managed single-value state container.
- **Portal<T>**: Dynamic multi-value state container.
- **Ensemble<T>**: Dynamic set-based state container.
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
  useEffect,
  useTimeout,
  use,
} from '@quon/core';

const counterApp = () => {
  // Create an atom (state)
  const count = useAtom(0);

  // Cast the atom into a Field and observe changes
  useCast(() => {
    const value = use(count);
    useEffect(() => {
      console.log('Count:', value);
    });
  });

  // Update count after 1 second
  useTimeout(1000);
  useEffect(() => count.set(1));

  useTimeout(1000);
  useEffect(() => count.set(2));
};

// Execute the blueprint
const app = toField(counterApp).asMatter().materialize();

// Later: cleanup
// await app.vanish();
```

## Core Concepts

### Field<T>

`Field<T>` represents a reactive source of values. It couples listeners to emitted values through Matter.

```typescript
// Transform values
const doubled = field.map(x => x * 2);

// Filter values
const evens = field.filter(x => x % 2 === 0);

// Append (merge) fields
const merged = field1.append(field2);
```

### Matter<T>

`Matter<T>` represents an object with a lifecycle (materialize/vanish). Blueprints are compiled into Matters via Fields.

```typescript
const matter = new Effect<string>((addFinalizeFn) => {
  addFinalizeFn(() => console.log('cleanup'));
  return 'hello';
});
const { result, vanish } = matter.materialize();

// ... later
await vanish();
```

### Blueprint

`Blueprint` is a synchronous-style DSL for composing Fields and Matters.

```typescript
import { toField, useAtom, useEffect } from '@quon/core';

const myBlueprint = () => {
  const atom = useAtom(0);

  // Side effects must be wrapped in useEffect
  useEffect(() => {
    console.log('Atom created');
  });
};

const app = toField(myBlueprint).asMatter().materialize();
```

### Atom<T>

`Atom<T>` is a `Field<T>` that holds a single current value. It is similar to a "cell" or "signal" in other libraries.

```typescript
const count = useAtom(0);

// Update value
useEffect(() => count.set(1));

// Modify based on previous value
useEffect(() => count.modify(prev => prev + 1));
```

### Portal<T>

`Portal<T>` is a `Field<T>` that allows dynamic connections. It represents a collection of values where items can be added or removed dynamically.

```typescript
const portal = usePortal<string>();

// Connect a value to the portal
useConnection(portal, 'Hello');
```

### Ensemble<T>

`Ensemble<T>` is a `Field<T>` that manages a set of values by identity. Values can be added and removed directly.

```typescript
const ensemble = useEnsemble<number>();

useEffect(() => ensemble.add(1));
useEffect(() => ensemble.add(2));
useEffect(() => ensemble.remove(1));
```

## API Reference

### Top-Level Exports

- **`toField<T>(blueprint: () => T): Field<T>`**
  - Converts a Blueprint function into a Field.

- **`use<T>(field: Field<T>): T`**
  - Uses a Field within a Blueprint.

- **`useEffect<T>(maker: (addFinalizeFn, abortSignal) => T): T`**
  - Executes a side effect with cleanup.

- **`useTimeout(delayMs: number): void`**
  - Pauses execution for a specified duration.

- **`useAtom<T>(initialValue: T): Atom<T>`**
  - Creates a managed single-value state.

- **`usePortal<T>(): Portal<T>`**
  - Creates a dynamic multi-value state.

- **`useEnsemble<T>(): Ensemble<T>`**
  - Creates a dynamic set-based state.

- **`useConnection<T>(portal: Portal<T>, val: T): void`**
  - Connects a value to a Portal.

- **`useCast<T>(blueprint: () => T): Field<T>`**
  - Casts a Blueprint into a Field by running it inside a Portal.

- **`useAppended<T>(left: () => T, right: () => T): T`**
  - Runs two Blueprints in parallel.

- **`useConcatenated<T>(blueprints: (() => T)[]): T`**
  - Runs multiple Blueprints sequentially.

- **`createContext<T>(): Context<T>`**
  - Creates a context for dependency injection.

### Classes

- **`Field<T>`**
  - `couple(listener: (val: T) => Matter<void>): Matter<void>`
  - `asMatter(): Matter<void>`
  - `map<U>(fn: (val: T) => U): Field<U>`
  - `flatMap<U>(fn: (val: T) => Field<U>): Field<U>`
  - `filter(predicate: (val: T) => boolean): Field<T>`
  - `append(other: Field<T>): Field<T>`
  - `static concat<T>(fields: Field<T>[]): Field<T>`
  - `static pure<T>(val: T): Field<T>`
  - `static ofMatter<T>(matter: Matter<T>): Field<T>`

- **`Matter<T>`**
  - `materialize(): Presence<T>`
  - `map<U>(fn: (result: T) => U): Matter<U>`
  - `flatMap<U>(fn: (result: T) => Matter<U>): Matter<U>`
  - `parZip<U>(other: Matter<U>): Matter<[T, U]>`
  - `static pure<T>(value: T): Matter<T>`
  - `static parSequence<T>(matters: Matter<T>[]): Matter<T[]>`
  - `static ofClass<T>(Cls: PresenceClass<T>): Matter<T>`

- **`Effect<T>` extends `Matter<T>`**
  - Constructor: `new Effect<T>((addFinalizeFn, abortSignal) => T | Promise<T>)`

## License

MIT
