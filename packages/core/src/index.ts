import * as B from './blueprint';

// Class exports (needed for instanceof checks and direct usage)
export { Field } from './field';
export { Matter, Effect } from './matter';
export type { Presence, PresenceClass } from './matter';
export { Atom } from './field/atom';
export { Portal } from './field/portal';
export { Ensemble } from './field/ensemble';
export type { MaybePromise } from './util';
export type { Context } from './blueprint';
export { useMemoize, useLatest, useArray, useGroupBy } from './complex';

/**
 * Uses a Field within a Blueprint.
 * The Field is coupled when the Blueprint executes this line.
 * If the underlying Matter is asynchronous, the Blueprint execution pauses until it completes.
 * @param field The Field to use.
 */
export const use = B.use;

/**
 * Executes a side effect with automatic cleanup.
 * The effect function is called when the Blueprint executes.
 * The cleanup function (registered via addFinalizeFn) is called when the Blueprint scope ends.
 * @param maker A function that performs the side effect. It receives `addFinalizeFn` to register cleanup logic and `abortSignal` for cancellation.
 */
export const useEffect = B.useEffect;

/**
 * Pauses execution for a specified duration.
 * @param delayMs The duration to wait in milliseconds.
 */
export const useTimeout = B.useTimeout;

/**
 * Creates a managed single-value state (Atom).
 * The Atom holds a value that can be updated.
 * @param initialValue The initial value of the Atom.
 * @returns An Atom instance.
 */
export const useAtom = B.useAtom;

/**
 * Creates a dynamic multi-value state (Portal).
 * The Portal allows connecting multiple values dynamically.
 * @returns A Portal instance.
 */
export const usePortal = B.usePortal;

/**
 * Creates a dynamic set-based state (Ensemble).
 * The Ensemble allows adding and removing values by identity.
 * @returns An Ensemble instance.
 */
export const useEnsemble = B.useEnsemble;

/**
 * Connects a value to a Portal.
 * The value remains connected as long as the current Blueprint scope is active.
 * @param portal The Portal to connect to.
 * @param val The value to connect.
 */
export const useConnection = B.useConnection;

/**
 * Casts a Blueprint into a Field by running it inside a Portal.
 * Each value emitted by the Blueprint is tracked as a Portal entry.
 * @param blueprint A Blueprint function to cast.
 * @returns A Field emitting the values produced by the Blueprint.
 */
export const useCast = B.useCast;

/**
 * Runs multiple Blueprints sequentially (concatenation) and returns the result of each.
 * @param blueprints An array of Blueprint functions to run.
 */
export const useConcatenated = B.useConcatenated;

/**
 * Runs two Blueprints in parallel and returns the result of either.
 * @param leftBlueprint The first Blueprint.
 * @param rightBlueprint The second Blueprint.
 */
export const useAppended = B.useAppended;

/**
 * Converts a Blueprint function into a Field.
 * The Field can then be coupled with a listener and materialized.
 * @param blueprint The Blueprint function.
 * @returns A Field representing the Blueprint.
 */
export const toField = B.toField;

/**
 * Creates a context for dependency injection within Blueprints.
 * Use `useProvider(value)` in a parent Blueprint and `useConsumer()` in a child.
 */
export const createContext = B.createContext;
