// Class exports (needed for instanceof checks and direct usage)
export { Field } from './field';
export type { Scalar } from './field';
export { Operator, Interaction, RefOp } from './operator';
export type { Excitation, ExcitationClass, Ref } from './operator';
export { Atom } from './field/atom';
export { Bridge } from './field/bridge';
export { Cluster } from './field/cluster';
export type { MaybePromise } from './util';
export type { Context } from './diagram';
export { useCoalescing, useArray, useGroupBy } from './complex';

// Diagram DSL re-exports
export {
  use,
  useInteraction,
  useTimeout,
  useAtom,
  useBridge,
  useCluster,
  useConnection,
  useCast,
  toField,
  createContext,
  useCasts,
  useId,
  useOperator,
  useRef,
  useScatter,
} from './diagram';
