import { MaybePromise } from './util';

/**
 * Represents a exicited Operator with a result and a cleanup function.
 */
export interface Excitation<T> {
  /** The result value, possibly asynchronous. */
  result: MaybePromise<T>;
  /** Cleanup function to release resources. */
  decay(this: void): MaybePromise<void>;
}

export type ExcitationClass<T, Args extends unknown[]> = new (
  ...args: Args
) => Excitation<T>;

/**
 * Operator represents an object that has a lifecycle (exicite/decay).
 */
export abstract class Operator<T> {
  /** Materializes this Operator, producing a Excitation with a result and cleanup function. */
  public abstract exicite(): Excitation<T>;

  /** Transforms the result of this Operator using the given function. */
  public map<U>(fn: (result: T) => U): Operator<U> {
    const exicite = this.exicite.bind(this);
    return new (class extends Operator<U> {
      exicite(): Excitation<U> {
        const { result, decay } = exicite();
        return {
          result: result instanceof Promise ? result.then(fn) : fn(result),
          decay,
        };
      }
    })();
  }

  /** Chains this Operator with a function that returns another Operator. */
  public flatMap<U>(fn: (result: T) => Operator<U>): Operator<U> {
    const exicite = this.exicite.bind(this);
    return new (class extends Operator<U> {
      exicite(): Excitation<U> {
        const { result, decay } = exicite();
        let innerVanish: (() => MaybePromise<void>) | undefined;
        let isVanished = false;
        let innerResult: MaybePromise<U>;

        if (result instanceof Promise) {
          innerResult = result.then(val => {
            if (isVanished) {
              throw new Error('Operator decayed');
            }
            const inner = fn(val).exicite();
            innerVanish = (): MaybePromise<void> => inner.decay();
            return inner.result;
          });
        } else {
          const inner = fn(result).exicite();
          innerVanish = (): MaybePromise<void> => inner.decay();
          innerResult = inner.result;
        }
        return {
          result: innerResult,
          decay: (): MaybePromise<void> => {
            isVanished = true;
            if (innerVanish) {
              const res = innerVanish();
              if (res instanceof Promise) {
                return res.then(decay);
              }
            }
            return decay();
          },
        };
      }
    })();
  }

  /** Creates a Operator that immediately resolves to the given value with no cleanup. */
  public static pure<T>(value: T): Operator<T> {
    return new (class extends Operator<T> {
      exicite(): Excitation<T> {
        return {
          result: value,
          decay: () => undefined,
        };
      }
    })();
  }

  /** Materializes all given Operators in parallel and collects their results. */
  public static parSequence<T extends unknown[]>(operators: {
    [K in keyof T]: Operator<T[K]>;
  }): Operator<T> {
    return new (class extends Operator<T> {
      exicite(): Excitation<T> {
        const initializeResults = operators.map(operator => {
          return operator.exicite();
        });
        const results = initializeResults.map(result => result.result);
        const decayes = initializeResults.map(result => result.decay);
        return {
          result: results.some(result => result instanceof Promise)
            ? (Promise.all(results) as Promise<T>)
            : (results as T),
          decay: (): MaybePromise<void> => {
            const decayResults = decayes.map(decay => decay());
            return decayResults.some(result => result instanceof Promise)
              ? Promise.all(decayResults).then(() => {})
              : undefined;
          },
        };
      }
    })();
  }

  /** Materializes this Operator and another in parallel, returning both results as a tuple. */
  public parZip<U>(other: Operator<U>): Operator<[T, U]> {
    const exicite = this.exicite.bind(this);
    return new (class extends Operator<[T, U]> {
      exicite(): Excitation<[T, U]> {
        const { result: resultA, decay: decayA } = exicite();
        const { result: resultB, decay: decayB } = other.exicite();
        const result =
          resultA instanceof Promise || resultB instanceof Promise
            ? (Promise.all([resultA, resultB]) as Promise<[T, U]>)
            : ([resultA, resultB] as [T, U]);
        return {
          result,
          decay: (): MaybePromise<void> => {
            const decayResults = [decayA(), decayB()];
            return decayResults.some(result => result instanceof Promise)
              ? Promise.all(decayResults).then(() => {})
              : undefined;
          },
        };
      }
    })();
  }

  /** Creates a Operator from a Excitation class constructor. */
  public static ofClass<T, Args extends unknown[]>(
    Cls: ExcitationClass<T, Args>,
    ...args: Args
  ): Operator<T> {
    return new (class extends Operator<T> {
      exicite(): Excitation<T> {
        const instance = new Cls(...args);
        return {
          result: instance.result,
          decay: () => instance.decay(),
        };
      }
    })();
  }
}

// ============================================================================
// Core Operator Constructors
// ============================================================================

/**
 * A Operator subclass for side effects with lifecycle management.
 * Register cleanup functions via `addFinalizeFn` (called in reverse order on decay).
 */
export class Interaction<T> extends Operator<T> {
  exicite(): Excitation<T> {
    const finalizeFns: Array<() => MaybePromise<void>> = [];
    const abortController = new AbortController();

    let isFinalized = false;
    let cleanupResult: MaybePromise<void>;
    const resultMaybePromise = this.initializeFn(finalizeFn => {
      finalizeFns.push(finalizeFn);
    }, abortController.signal);

    const result =
      resultMaybePromise instanceof Promise
        ? resultMaybePromise.then(v => {
            if (isFinalized) {
              return new Promise<T>(() => {
                // keep pending: this effect was cancelled/finalized
              });
            }
            return v;
          })
        : resultMaybePromise;

    const decay = (): MaybePromise<void> => {
      if (isFinalized) return cleanupResult;
      isFinalized = true;
      abortController.abort();

      let chain: Promise<void> | undefined;
      for (let i = finalizeFns.length - 1; i >= 0; i--) {
        const fn = finalizeFns[i];
        if (!fn) continue;

        if (chain) {
          chain = chain.then(() => fn());
        } else {
          const res = fn();
          if (res instanceof Promise) {
            chain = res;
          }
        }
      }

      cleanupResult = chain;
      return cleanupResult;
    };
    return {
      result,
      decay,
    };
  }

  constructor(
    private initializeFn: (
      addFinalizeFn: (finalizeFn: () => MaybePromise<void>) => void,
      abortSignal: AbortSignal
    ) => MaybePromise<T>
  ) {
    super();
  }
}

export class IdOp extends Operator<symbol> {
  constructor(private description?: string) {
    super();
  }

  exicite(): Excitation<symbol> {
    const id = Symbol(this.description);
    return {
      result: id,
      decay: () => undefined,
    };
  }
}

export type Ref<T> = { current: T };

export class RefOp<T> extends Operator<Ref<T>> {
  constructor(private initialValue: T) {
    super();
  }

  exicite(): Excitation<Ref<T>> {
    const ref: Ref<T> = { current: this.initialValue };
    return {
      result: ref,
      decay: () => undefined,
    };
  }
}
