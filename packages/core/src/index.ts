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

// Blueprint DSL re-exports
export {
  use,
  useEffect,
  useTimeout,
  useAtom,
  usePortal,
  useEnsemble,
  useConnection,
  useCast,
  useConcatenated,
  useAppended,
  toField,
  createContext,
} from './blueprint';
