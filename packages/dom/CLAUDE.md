# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this package.

## Project Overview

`@quon/dom` is a reactive DOM library built on top of `@quon/core`. It enables JSX-based UI development with automatic reactivity through `Field` and `Operator`, without requiring a virtual DOM. The library provides Vue-like ergonomics where reactive values automatically update the DOM.

## Development Commands

### Building

```bash
pnpm run build        # Build for production (CJS + ESM + type declarations)
pnpm run dev          # Build in watch mode for development
```

### Type Checking

```bash
pnpm run lint         # Run TypeScript type checking without emitting files
```

### Testing

```bash
pnpm test             # Run tests in watch mode
pnpm run test:run     # Run tests once (CI mode)
```

### Example

```bash
pnpm run dev:example  # Run the example app with Vite
```

## Architecture

### Core Concepts

**Element Type System**

- `Element` is a tagged union: `Field<Element> | ElementNode | string | number | Element[] | null | undefined`
- `Field<Element>` represents reactive components (Diagram-based) or reactive values
- `ElementNode` represents static DOM element descriptions with `{ tag, props, children }`
- Arrays represent fragments or lists of elements

**Reactive Rendering**

- User code is written as Diagrams: `() => Element`
- JSX factory (`jsx()`) wraps components into `Field<Element>` via `toField()`
- The `useRender()` function recursively processes `Element` values:
  - `Field<Element>` → subscribes via `useCast` and re-renders on changes
  - `ElementNode` → creates DOM element, applies props, renders children
  - `string/number` → creates text nodes
  - `Element[]` → renders each element in sequence

**Reactivity Without Virtual DOM**

- Props can be `Field<T>` values (e.g., `Atom<string>`)
- When a `Field` prop is detected, `useCast` + `useInteraction` automatically update the DOM property
- No diffing or reconciliation needed - direct DOM manipulation guided by reactivity

### File Structure

```
src/
├── index.ts       # Public API exports
├── types.ts       # Core type definitions (Element, Props, Component, etc.)
├── jsx.ts         # JSX factory function and Fragment
├── component.ts   # component() helper (toField wrapper)
├── render.ts      # Core rendering logic (recursive Element → DOM)
└── utils.ts       # Type guards and utilities
```

### Key Implementation Details

**JSX Configuration**

- `jsxFactory: "jsx"` - custom JSX factory function
- `jsxFragmentFactory: "Fragment"` - fragment component
- String tags (e.g., "div") → create `ElementNode`
- Function tags (components) → call function and return `Field<Element>`

**Component Pattern**

```typescript
const Counter = component(() => {
  const count = useAtom(0);
  return <div>{count}</div>;
});
```

**Reactive Props**

```typescript
const text = useAtom("Hello");
<input value={text} />  // Automatically updates when text changes
```

### Dependencies

- `@quon/core` - Reactive primitives (Field, Operator, Diagram)
- Core concepts: `toField`, `useAtom`, `useCast`, `useInteraction`, `use()`
