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

This is a reactive programming library built around **Field**, **Matter**, and **Blueprint** - providing a declarative API for managing reactive state and side effects with automatic cleanup.

### Core Concepts

- **Matter<T>**: Represents an object with a lifecycle (materialize/vanish). Returns a `Presence<T>` containing a result and a `vanish` cleanup function.
- **Field<V>**: Represents a reactive source of values. Couples listeners to emitted values via Matter.
- **Blueprint**: A synchronous-style DSL for composing Fields and Matters.
- **Atom<T>**: Managed single-value state container (similar to "cell" or "signal").
- **Portal<T>**: Dynamic multi-value state container with indexed entries.
- **Ensemble<T>**: Dynamic set-based state container with values managed by identity.
- **Effect<T>**: A Matter subclass for side effects with cleanup via `addFinalizeFn`.

### Key Files

- `src/matter.ts`: Core Matter implementation, Presence interface, and Effect class
- `src/field.ts`: Field abstract class (reactive source)
- `src/blueprint.ts`: Blueprint DSL implementation with `useX` functions
- `src/field/atom.ts`: Atom - single-value reactive state
- `src/field/portal.ts`: Portal - multi-value reactive state with indexed entries
- `src/field/ensemble.ts`: Ensemble - set-based reactive state
- `src/bilink-map.ts`: Bidirectional map for managing Listener-Value relationships
- `src/complex.ts`: Higher-level utilities (useGroupBy, useArray, useMemoize)
- `src/index.ts`: Main entry point with convenience re-exports
- `src/linked-list.ts`: Persistent linked list implementation
- `src/util.ts`: Utility types (MaybePromise)

### Reactive System

The library uses a Matter-based execution model where:

1. **Matter** represents objects with lifecycle management (materialize → vanish)
2. **Field** represents reactive sources that couple listeners to values
3. **Blueprint** provides a synchronous-style DSL where `useX` functions compose Fields and Matters
4. **Atom** holds a single value that can be updated (triggers re-execution on change)
5. **Portal** manages multiple indexed values dynamically (values can be connected/disconnected)
6. **Ensemble** manages a set of values by identity (values can be added/removed)
7. **Effect** handles side effects and cleanup in reverse order of creation

### API Conventions

#### Matter

- **`Matter<T>`**: Abstract class for lifecycle objects
  - `materialize(): Presence<T>` - Materialize the matter, returning result and vanish function
  - `map<U>(fn: (result: T) => U): Matter<U>` - Transform result
  - `flatMap<U>(fn: (result: T) => Matter<U>): Matter<U>` - Chain matters
  - `parZip<U>(other: Matter<U>): Matter<[T, U]>` - Parallel zip
  - `Matter.pure<T>(value: T): Matter<T>` - Create pure matter
  - `Matter.parSequence<T>(matters: Matter<T>[]): Matter<T[]>` - Run in parallel
  - `Matter.ofClass<T>(Cls: PresenceClass<T>): Matter<T>` - Create from Presence class

- **`Effect<T>`**: Matter subclass for side effects
  - Constructor: `new Effect<T>((addFinalizeFn, abortSignal) => T | Promise<T>)`
  - Use `addFinalizeFn()` to register cleanup functions (called in reverse order)
  - `abortSignal` indicates when the effect is being cancelled

- **`Presence<T>`**: Interface representing a materialized matter
  - `result: MaybePromise<T>` - The result value
  - `vanish(): MaybePromise<void>` - Cleanup function

#### Field

- **`Field<V>`**: Abstract class for reactive sources
  - `couple(listener: (val: V) => Matter<void>): Matter<void>` - Couple a listener
  - `asMatter(): Matter<void>` - Convert to Matter (ignoring emitted values)
  - `map<U>(fn: (val: V) => U): Field<U>` - Transform values
  - `flatMap<U>(fn: (val: V) => Field<U>): Field<U>` - Chain fields
  - `filter(predicate: (val: V) => boolean): Field<V>` - Filter values
  - `append(other: Field<V>): Field<V>` - Merge two fields
  - `Field.concat<T>(fields: Field<T>[]): Field<T>` - Merge multiple fields
  - `Field.pure<V>(val: V): Field<V>` - Create a field with a single value
  - `Field.ofMatter<V>(matter: Matter<V>): Field<V>` - Create from a Matter

#### Blueprint

Blueprints are synchronous-style functions that compose Fields and Matters. All `useX` functions must be called at the top level of a Blueprint (not inside conditionals, loops, or callbacks).

**Core Blueprint APIs:**

- **`toField<T>(blueprint: () => T, userCtx?: UserContext): Field<T>`**
  - Converts a Blueprint function into a Field

- **`use<T>(field: Field<T>): T`**
  - Uses a Field within a Blueprint (creates async continuation)
  - Throws an exception internally for control flow (don't catch this!)

- **`useEffect<T>(maker: (addFinalizeFn, abortSignal) => T | Promise<T>): T`**
  - Executes side effects with automatic cleanup
  - Use `addFinalizeFn()` to register cleanup functions
  - `abortSignal` indicates cancellation
  - Should be used for all I/O, timers, console.log, and other side effects

- **`useTimeout(delayMs: number): void`**
  - Pauses Blueprint execution for specified milliseconds

- **`useAppended<T>(leftBlueprint: () => T, rightBlueprint: () => T): T`**
  - Runs two Blueprints in parallel

- **`useConcatenated<T>(blueprints: (() => T)[]): T`**
  - Runs multiple Blueprints sequentially

**State Management Blueprint APIs:**

- **`useAtom<T>(initialValue: T): Atom<T>`**
  - Creates a managed single-value state
  - The Atom can be updated with `set()` or `modify()`
  - Current value accessible via `peek()`

- **`usePortal<T>(): Portal<T>`**
  - Creates a dynamic multi-value state with indexed entries
  - Values can be connected/disconnected dynamically

- **`useEnsemble<T>(): Ensemble<T>`**
  - Creates a dynamic set-based state
  - Values can be added/removed by identity

- **`useConnection<T>(portal: Portal<T>, val: T): void`**
  - Connects a value to a Portal
  - The value remains connected as long as the Blueprint scope is active

- **`useCast<T>(blueprint: () => T): Field<T>`**
  - Casts a Blueprint into a Field by running it inside a Portal

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

#### Portal<T>

- `connect(val: V): Matter<void>` - Add a value (returns Matter for lifecycle)
- `items(): readonly V[]` - Get current values
- `static cast<T>(field: Field<T>): Matter<Field<T>>` - Cast a field through a Portal

#### Ensemble<T>

- `add(val: V): void` - Add a value
- `remove(val: V): Promise<void>` - Remove a value
- `items(): readonly V[]` - Get current values

### Important Patterns

1. **All `useX` functions must be called at Blueprint top level**: Don't call inside if/loops/callbacks
2. **Side effects must use `useEffect`**: All I/O, console.log, timers, etc.
3. **Cleanup via `addFinalizeFn`**: Register cleanup functions (executed in reverse order)
4. **Never catch exceptions across `use()` boundaries**: Blueprint uses exceptions for control flow internally
5. **Matter lifecycle**: Always call `vanish()` to prevent memory leaks
6. **Context is Blueprint-scoped**: Use `useProvider()` in parent, `useConsumer()` in child

### Design Constraints

1. **Synchronous Blueprint execution**: Blueprints run synchronously until a `use()` call
2. **Exception-based control flow**: Internal exceptions implement async continuations
3. **Global context during Blueprint execution**: `BLUEPRINT_GLOBAL_CONTEXT` is set/restored synchronously
4. **Array-based history**: Blueprint uses array copying for execution history (fast for small histories)

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
- Each test should clean up after itself by calling `vanish()` on materialized Matters

## Common Pitfalls

1. **Don't catch exceptions around `use()` calls**: This will break Blueprint control flow
2. **Don't call `useX` functions conditionally**: Must be at top level
3. **Don't forget to call `vanish()`**: Memory leaks will occur
4. **Don't use side effects outside `useEffect`**: Breaks determinism
5. **Don't share reactive state across unrelated Blueprints**: Each should have its own lifecycle

## API Design Notes

### Convenience Re-exports (React-like Pattern)

Following React's design pattern, frequently used functions are re-exported directly from the main module:

```typescript
// These work without a namespace:
import {
  use,
  useEffect,
  useTimeout,
  useAtom,
  usePortal,
  useEnsemble,
  useConnection,
  useCast,
  useAppended,
  useConcatenated,
  toField,
  createContext,
} from '@quon/core';
```
