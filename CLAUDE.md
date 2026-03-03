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

This is a reactive programming library built around **Field**, **Operator**, and **Diagram** - providing a declarative API for managing reactive state and side effects with automatic cleanup.

### Core Concepts

- **Operator<T>**: Represents an object with a lifecycle (exicite/decay). Returns a `Excitation<T>` containing a result and a `decay` cleanup function.
- **Field<V>**: Represents a reactive source of values. Couples listeners to emitted values via Operator.
- **Diagram**: A synchronous-style DSL for composing Fields and Operators.
- **Atom<T>**: Managed single-value state container (similar to "cell" or "signal").
- **Bridge<T>**: Dynamic multi-value state container with indexed entries.
- **Cluster<T>**: Dynamic set-based state container with values managed by identity.
- **Interaction<T>**: A Operator subclass for side effects with cleanup via `addFinalizeFn`.

### Key Files

- `src/operator.ts`: Core Operator implementation, Excitation interface, and Interaction class
- `src/field.ts`: Field abstract class (reactive source)
- `src/diagram.ts`: Diagram DSL implementation with `useX` functions
- `src/field/atom.ts`: Atom - single-value reactive state
- `src/field/bridge.ts`: Bridge - multi-value reactive state with indexed entries
- `src/field/cluster.ts`: Cluster - set-based reactive state
- `src/bilink-map.ts`: Bidirectional map for managing Listener-Value relationships
- `src/complex.ts`: Higher-level utilities (useGroupBy, useArray, useMemoize)
- `src/index.ts`: Main entry point with convenience re-exports
- `src/linked-list.ts`: Persistent linked list implementation
- `src/util.ts`: Utility types (MaybePromise)

### Reactive System

The library uses a Operator-based execution model where:

1. **Operator** represents objects with lifecycle management (exicite → decay)
2. **Field** represents reactive sources that couple listeners to values
3. **Diagram** provides a synchronous-style DSL where `useX` functions compose Fields and Operators
4. **Atom** holds a single value that can be updated (triggers re-execution on change)
5. **Bridge** manages multiple indexed values dynamically (values can be connected/disconnected)
6. **Cluster** manages a set of values by identity (values can be added/removed)
7. **Interaction** handles side effects and cleanup in reverse order of creation

### API Conventions

#### Operator

- **`Operator<T>`**: Abstract class for lifecycle objects
  - `exicite(): Excitation<T>` - Materialize the operator, returning result and decay function
  - `map<U>(fn: (result: T) => U): Operator<U>` - Transform result
  - `flatMap<U>(fn: (result: T) => Operator<U>): Operator<U>` - Chain operators
  - `parZip<U>(other: Operator<U>): Operator<[T, U]>` - Parallel zip
  - `Operator.pure<T>(value: T): Operator<T>` - Create pure operator
  - `Operator.parSequence<T>(operators: Operator<T>[]): Operator<T[]>` - Run in parallel
  - `Operator.ofClass<T>(Cls: ExcitationClass<T>): Operator<T>` - Create from Excitation class

- **`Interaction<T>`**: Operator subclass for side effects
  - Constructor: `new Interaction<T>((addFinalizeFn, abortSignal) => T | Promise<T>)`
  - Use `addFinalizeFn()` to register cleanup functions (called in reverse order)
  - `abortSignal` indicates when the effect is being cancelled

- **`Excitation<T>`**: Interface representing a exicited operator
  - `result: MaybePromise<T>` - The result value
  - `decay(): MaybePromise<void>` - Cleanup function

#### Field

- **`Field<V>`**: Abstract class for reactive sources
  - `couple(listener: (val: V) => Operator<void>): Operator<void>` - Couple a listener
  - `asOperator(): Operator<void>` - Convert to Operator (ignoring emitted values)
  - `map<U>(fn: (val: V) => U): Field<U>` - Transform values
  - `flatMap<U>(fn: (val: V) => Field<U>): Field<U>` - Chain fields
  - `filter(predicate: (val: V) => boolean): Field<V>` - Filter values
  - `append(other: Field<V>): Field<V>` - Merge two fields
  - `Field.concat<T>(fields: Field<T>[]): Field<T>` - Merge multiple fields
  - `Field.pure<V>(val: V): Field<V>` - Create a field with a single value
  - `Field.ofOperator<V>(operator: Operator<V>): Field<V>` - Create from a Operator

#### Diagram

Diagrams are synchronous-style functions that compose Fields and Operators. All `useX` functions must be called at the top level of a Diagram (not inside conditionals, loops, or callbacks).

**Core Diagram APIs:**

- **`toField<T>(diagram: () => T, userCtx?: UserContext): Field<T>`**
  - Converts a Diagram function into a Field

- **`use<T>(field: Field<T>): T`**
  - Uses a Field within a Diagram (creates async continuation)
  - Throws an exception internally for control flow (don't catch this!)

- **`useInteraction<T>(maker: (addFinalizeFn, abortSignal) => T | Promise<T>): T`**
  - Executes side effects with automatic cleanup
  - Use `addFinalizeFn()` to register cleanup functions
  - `abortSignal` indicates cancellation
  - Should be used for all I/O, timers, console.log, and other side effects

- **`useTimeout(delayMs: number): void`**
  - Pauses Diagram execution for specified milliseconds

- **`useAppended<T>(leftDiagram: () => T, rightDiagram: () => T): T`**
  - Runs two Diagrams in parallel

- **`useConcatenated<T>(diagrams: (() => T)[]): T`**
  - Runs multiple Diagrams sequentially

**State Management Diagram APIs:**

- **`useAtom<T>(initialValue: T): Atom<T>`**
  - Creates a managed single-value state
  - The Atom can be updated with `set()` or `modify()`
  - Current value accessible via `peek()`

- **`useBridge<T>(): Bridge<T>`**
  - Creates a dynamic multi-value state with indexed entries
  - Values can be connected/disconnected dynamically

- **`useCluster<T>(): Cluster<T>`**
  - Creates a dynamic set-based state
  - Values can be added/removed by identity

- **`useConnection<T>(bridge: Bridge<T>, val: T): void`**
  - Connects a value to a Bridge
  - The value remains connected as long as the Diagram scope is active

- **`useCast<T>(diagram: () => T): Field<T>`**
  - Casts a Diagram into a Field by running it inside a Bridge

**Context APIs:**

- **`createContext<T>(): Context<T>`**
  - Creates a context for dependency injection
  - Returns object with `key`, `useProvider(value)`, and `useConsumer()`

- **`useUserContext(): UserContext`**
  - Returns current context values

#### Atom<T>

- `set(val: V): void` - Replace current value
- `modify(fn: (val: V) => V): void` - Update based on current value
- `peek(): V` - Get current value without subscription

#### Bridge<T>

- `connect(val: V): Operator<void>` - Add a value (returns Operator for lifecycle)
- `items(): readonly V[]` - Get current values
- `static cast<T>(field: Field<T>): Operator<Field<T>>` - Cast a field through a Bridge

#### Cluster<T>

- `add(val: V): void` - Add a value
- `remove(val: V): Promise<void>` - Remove a value
- `items(): readonly V[]` - Get current values

### Important Patterns

1. **All `useX` functions must be called at Diagram top level**: Don't call inside if/loops/callbacks
2. **Side effects must use `useInteraction`**: All I/O, console.log, timers, etc.
3. **Cleanup via `addFinalizeFn`**: Register cleanup functions (executed in reverse order)
4. **Never catch exceptions across `use()` boundaries**: Diagram uses exceptions for control flow internally
5. **Operator lifecycle**: Always call `decay()` to prevent memory leaks
6. **Context is Diagram-scoped**: Use `useProvider()` in parent, `useConsumer()` in child

### Design Constraints

1. **Synchronous Diagram execution**: Diagrams run synchronously until a `use()` call
2. **Exception-based control flow**: Internal exceptions implement async continuations
3. **Global context during Diagram execution**: `DIAGRAM_GLOBAL_CONTEXT` is set/restored synchronously
4. **Array-based history**: Diagram uses array copying for execution history (fast for small histories)

## Code Style

- TypeScript with strict configuration
- ESLint enforces explicit return types and minimal `any` usage
- Prettier formatting with single quotes and 2-space indentation
- All source code in `src/`, tests in `tests/`, examples in `examples/`
- Compiled output in `dist/`
- `useX` prefix indicates Diagram-only functions
- Synchronous-style function calls (no `yield*` or `async function*`)

## Testing

- Tests use Node.js built-in test runner (`node:test`)
- Test files are in `tests/` directory with `.test.ts` suffix
- Use `LogCapture` utility from `tests/test-utils.ts` to capture and assert log outputs
- Tests should be fast and isolated
- Each test should clean up after itself by calling `decay()` on exicited Operators

## Common Pitfalls

1. **Don't catch exceptions around `use()` calls**: This will break Diagram control flow
2. **Don't call `useX` functions conditionally**: Must be at top level
3. **Don't forget to call `decay()`**: Memory leaks will occur
4. **Don't use side effects outside `useInteraction`**: Breaks determinism
5. **Don't share reactive state across unrelated Diagrams**: Each should have its own lifecycle

## API Design Notes

### Convenience Re-exports (React-like Pattern)

Following React's design pattern, frequently used functions are re-exported directly from the main module:

```typescript
// These work without a namespace:
import {
  use,
  useInteraction,
  useTimeout,
  useAtom,
  useBridge,
  useCluster,
  useConnection,
  useCast,
  useAppended,
  useConcatenated,
  toField,
  createContext,
} from '@quon/core';
```
