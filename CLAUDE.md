# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `pnpm run build` - Compiles TypeScript to JavaScript in `dist/`
- **Test**: `pnpm test` - Runs tests using Node.js test runner
- **Test Watch**: `pnpm run test:watch` - Runs tests in watch mode
- **Examples**: `pnpm run examples` - Runs example code
- **Lint**: `pnpm run lint` - Runs ESLint on TypeScript files
- **Lint Fix**: `pnpm run lint:fix` - Fixes auto-fixable ESLint issues
- **Format**: `pnpm run format` - Formats code with Prettier
- **Format Check**: `pnpm run format:check` - Checks code formatting
- **Benchmark**: `pnpm run benchmark` - Runs benchmark tests

## Architecture

This is a reactive programming library built around **Routine**, **ReactiveSource**, and **Blueprint** - providing a declarative API for managing reactive state and side effects with automatic cleanup.

### Core Concepts

- **Routine<T>**: Represents a task or process with a lifecycle (initialize/finalize). Returns a result `T` and provides cleanup logic.
- **ReactiveSource<V>**: Represents a reactive stream of values (function-based for tree-shaking).
- **Blueprint**: A synchronous-style DSL for composing Routines.
- **Atom<T>**: Managed single-value state container (similar to "cell" or "signal").
- **Portal<K, V>**: Dynamic multi-value state container with key-value pairs.
- **Effect**: A Routine subclass for side effects with cleanup via `addFinalizeFn`.
- **Fiber<T>**: Represents a forked background task.

### Key Files

- `src/routine.ts`: Core Routine implementation and Effect class
- `src/blueprint.ts`: Blueprint DSL implementation with `useX` functions
- `src/reactive.ts`: Class-based reactive implementations (ReactiveSourceClass, ReactiveState, ReactiveCollection)
- `src/reactive/`: Functional reactive API for better tree-shaking
  - `src/reactive/source.ts`: Function-based ReactiveSource operations (map, filter, flatMap, etc.)
  - `src/reactive/collection.ts`: Function-based ReactiveCollection
  - `src/reactive/state.ts`: Function-based ReactiveState
- `src/bilink-map.ts`: Bidirectional map for managing Listener-Value relationships
- `src/complex.ts`: Higher-level utilities (useDistribution, useMemoize)
- `src/index.ts`: Main entry point with convenience re-exports
- `src/structural.ts`: Type definitions for structural equality
- `src/util.ts`: Utility types (MaybePromise)

### Implementation Status

The codebase is currently in transition between two architectural styles:

1. **Class-based API** (`src/reactive.ts`): Original implementation using classes
2. **Function-based API** (`src/reactive/` directory): Newer implementation optimized for minification and tree-shaking

Both implementations coexist. The function-based API is preferred for new code as it produces smaller bundle sizes.

### Reactive System

The library uses a Routine-based execution model where:

1. **Routines** represent tasks with lifecycle management (initialize → finalize)
2. **Blueprint** provides a synchronous-style DSL where `useX` functions chain Routines
3. **ReactiveSource** represents streams of values that can be observed and transformed
4. **Atom** holds a single value that can be updated (triggers re-execution on change)
5. **Portal** manages multiple values dynamically (values can be added/removed)
6. **Effect** handles side effects and cleanup in reverse order of creation
7. **Fiber** enables concurrent execution via fork/join

### API Conventions

#### Routine

- **`Routine<T>`**: Abstract class for tasks with lifecycle
  - `initialize(): { result: MaybePromise<T>, finalize: () => MaybePromise<void> }` - Start the routine
  - `map<U>(fn: (result: T) => U): Routine<U>` - Transform result
  - `then<U>(fn: (result: T) => Routine<U>): Routine<U>` - Chain routines
  - `Routine.resolve<T>(value: T): Routine<T>` - Create resolved routine
  - `Routine.all<T>(routines: Routine<T>[]): Routine<T[]>` - Run in parallel
  - `Routine.fork<T>(routine: Routine<T>): Routine<Fiber<T>>` - Fork background task
  - `Routine.join<T>(fiber: Fiber<T>): Routine<T>` - Join forked task

- **`Effect<T>`**: Routine subclass for side effects
  - Constructor: `new Effect<T>((addFinalizeFn, abortSignal) => T | Promise<T>)`
  - Use `addFinalizeFn()` to register cleanup functions (called in reverse order)
  - `abortSignal` indicates when the effect is being cancelled

#### Blueprint

Blueprints are synchronous-style functions that compose Routines. All `useX` functions must be called at the top level of a Blueprint (not inside conditionals, loops, or callbacks).

**Core Blueprint APIs:**

- **`toRoutine<T>(blueprint: () => T, userCtx?: UserContext): Routine<T>`**
  - Converts a Blueprint function into a Routine

- **`use<T>(routine: Routine<T>): T`**
  - Uses a Routine within a Blueprint (creates async continuation)
  - Throws an exception internally for control flow (don't catch this!)

- **`useEffect<T>(maker: (addFinalizeFn, abortSignal) => T | Promise<T>): T`**
  - Executes side effects with automatic cleanup
  - Use `addFinalizeFn()` to register cleanup functions
  - `abortSignal` indicates cancellation
  - Should be used for all I/O, timers, console.log, and other side effects

- **`useTimeout(delayMs: number): void`**
  - Pauses Blueprint execution for specified milliseconds

- **`useAll<T, U>(leftBlueprint: () => T, rightBlueprint: () => U): [T, U]`**
  - Runs two Blueprints in parallel and returns results as tuple

- **`useFork<T>(blueprint: () => T): Fiber<T>`**
  - Forks a Blueprint into a separate background task

- **`useJoin<T>(fiber: Fiber<T>): T`**
  - Joins a forked Fiber, waiting for completion

**State Management Blueprint APIs:**

- **`useAtom<T>(initialValue: T): Atom<T>`**
  - Creates a managed single-value state
  - The Atom can be updated with `set()` or `modify()`
  - Current value accessible via `peek()`

- **`usePortal<K, V>(): Portal<K, V>`**
  - Creates a dynamic multi-value state with key-value pairs
  - Values can be added/removed dynamically

- **`useConnection<K, V>(portal: Portal<K, V>, key: K, val: V): void`**
  - Connects a value to a Portal
  - The value remains connected as long as the Blueprint scope is active

- **`useDerivation<K, V, U>(source: Store<K, V>, blueprint: (val: V, key: K) => U): Store<K, U>`**
  - Derives a new Store by applying a Blueprint to each value
  - Similar to `switchMap` in other reactive libraries

**Context APIs:**

- **`createContext<T>(): Context<T>`**
  - Creates a context for dependency injection
  - Returns object with `key`, `useProvider(value)`, and `useConsumer()`

- **`useUserContext(): UserContext`**
  - Returns current context values

#### ReactiveSource (Function-based, in `src/reactive/`)

The function-based reactive API optimized for tree-shaking:

- **`ReactiveSource<V>`**: Type alias for `(listener: (val: V) => Routine<void>) => Routine<void>`
- **`map<V, U>(rs: ReactiveSource<V>, fn: (val: V) => U): ReactiveSource<U>`**
- **`filter<V>(rs: ReactiveSource<V>, fn: (val: V) => boolean): ReactiveSource<V>`**
- **`flatMap<V, U>(rs: ReactiveSource<V>, fn: (val: V) => ReactiveSource<U>): ReactiveSource<U>`**
- **`fromRoutine<V>(r: Routine<V>): ReactiveSource<V>`**
- **`of<V>(val: V): ReactiveSource<V>`**
- **`newCollection<V>(): Routine<ReactiveCollection<V>>`** - Creates a multi-value collection
- **`newState<V>(): Routine<ReactiveState<V>>`** - Creates a state container

#### ReactiveSourceClass (Class-based, in `src/reactive.ts`)

The original class-based reactive API:

- **`ReactiveSourceClass<V>`**: Abstract base class for reactive streams
  - `subscribe(listener: (val: V) => Routine<void>): Routine<void>` - Subscribe to values
  - `items(): readonly V[]` - Get current values
  - `map<U>(fn: (val: V) => U): ReactiveSourceClass<U>` - Transform values
  - `filter(fn: (val: V) => boolean): ReactiveSourceClass<V>` - Filter values
  - `flatMap<U>(fn: (val: V) => ReactiveSourceClass<U>): ReactiveSourceClass<U>` - Transform and flatten
  - `combine<U>(other: ReactiveSourceClass<U>): ReactiveSourceClass<[V, U]>` - Combine sources
  - `ReactiveSourceClass.fromRoutine<T>(routine: Routine<T>): ReactiveSourceClass<T>` - Create from routine
  - `ReactiveSourceClass.of<V>(value: V): ReactiveSourceClass<V>` - Create with single value

- **`ReactiveCollection<V>`**: Multi-value reactive container
  - `connect(value: V): Routine<void>` - Add a value
  - `finalize(): MaybePromise<void>` - Cleanup all values
  - `ReactiveCollection.factory<V>(): ReactiveSourceClass<ReactiveCollection<V>>` - Factory function

- **`ReactiveState<V>`**: Single-value reactive container
  - `set(newValue: V): void` - Update value
  - `modify(fn: (val: V) => V): void` - Update based on current value
  - `peek(): V` - Get current value without subscription
  - `finalize(): MaybePromise<void>` - Cleanup
  - `ReactiveState.factory<V>(initValue: V): ReactiveSourceClass<ReactiveState<V>>` - Factory function

### Important Patterns

1. **All `useX` functions must be called at Blueprint top level**: Don't call inside if/loops/callbacks
2. **Side effects must use `useEffect`**: All I/O, console.log, timers, etc.
3. **Cleanup via `addFinalizeFn`**: Register cleanup functions (executed in reverse order)
4. **Never catch exceptions across `use()` boundaries**: Blueprint uses exceptions for control flow internally
5. **Routine lifecycle**: Always call `finalize()` to prevent memory leaks
6. **Context is Blueprint-scoped**: Use `useProvider()` in parent, `useConsumer()` in child
7. **Function-based vs Class-based**: Prefer function-based API in `src/reactive/` for better bundle size

### Design Constraints

1. **Synchronous Blueprint execution**: Blueprints run synchronously until a `use()` call
2. **Exception-based control flow**: Internal exceptions implement async continuations
3. **Global context during Blueprint execution**: `BLUEPRINT_GLOBAL_CONTEXT` is set/restored synchronously
4. **Array-based history**: Blueprint uses array copying for execution history (fast for small histories)
5. **Tree-shaking optimization**: Function-based APIs are preferred for better dead-code elimination

## Code Style

- TypeScript with strict configuration
- ESLint enforces explicit return types and minimal `any` usage
- Prettier formatting with single quotes and 2-space indentation
- All source code in `src/`, tests in `tests/`, examples in `examples/`
- Compiled output in `dist/`
- `useX` prefix indicates Blueprint-only functions
- Synchronous-style function calls (no `yield*` or `async function*`)

## Testing

- Tests use Node.js built-in test runner (`node:test`)
- Test files are in `tests/` directory with `.test.ts` suffix
- Use `LogCapture` utility from `tests/test-utils.ts` to capture and assert log outputs
- Tests should be fast and isolated
- Each test should clean up after itself by calling `finalize()` on routines

## Common Pitfalls

1. **Don't catch exceptions around `use()` calls**: This will break Blueprint control flow
2. **Don't call `useX` functions conditionally**: Must be at top level
3. **Don't forget to call `finalize()`**: Memory leaks will occur
4. **Don't use side effects outside `useEffect`**: Breaks determinism
5. **Don't share reactive state across unrelated Blueprints**: Each should have its own lifecycle

## API Design Notes

### Convenience Re-exports (React-like Pattern)

Following React's design pattern, frequently used functions are re-exported directly from the main module:

```typescript
// These work without the Blueprint namespace:
import {
  use,
  useEffect,
  useTimeout,
  useAtom,
  usePortal,
  useConnection,
  useDerivation,
  useAll,
  useFork,
  useJoin,
  toRoutine,
} from '@quon/core';

// Less common functions still use the namespace:
import { Blueprint } from '@quon/core';
Blueprint.createContext();
Blueprint.useUserContext();
```

### Function-based vs Class-based APIs

**Function-based API** (`src/reactive/`):
- Better tree-shaking and minification
- Smaller bundle sizes
- Preferred for new code

**Class-based API** (`src/reactive.ts`):
- Original implementation
- More familiar OOP style
- Still supported but consider migrating to function-based API

Both APIs coexist and are interoperable.
