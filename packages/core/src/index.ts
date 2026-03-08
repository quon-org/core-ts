// Class exports (needed for instanceof checks and direct usage)
export { ReadonlyCollection as Field } from './field';
export type { Scalar } from './field';
export {
  Resource as Operator,
  EffectResource as Interaction,
  RefOp,
} from './resource';
export type {
  Instance as Excitation,
  InstanceClass as ExcitationClass,
  RuntimeRef as Ref,
} from './resource';
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
