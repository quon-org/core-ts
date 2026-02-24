import { MaybePromise } from './util';

/**
 * Represents a materialized Matter with a result and a cleanup function.
 */
export interface Presence<T> {
  /** The result value, possibly asynchronous. */
  result: MaybePromise<T>;
  /** Cleanup function to release resources. */
  vanish(this: void): MaybePromise<void>;
}

export type PresenceClass<T, Args extends unknown[]> = new (
  ...args: Args
) => Presence<T>;

/**
 * Matter represents an object that has a lifecycle (materialize/vanish).
 */
export abstract class Matter<T> {
  /** Materializes this Matter, producing a Presence with a result and cleanup function. */
  public abstract materialize(): Presence<T>;

  /** Transforms the result of this Matter using the given function. */
  public map<U>(fn: (result: T) => U): Matter<U> {
    const materialize = this.materialize.bind(this);
    return new (class extends Matter<U> {
      materialize(): Presence<U> {
        const { result, vanish } = materialize();
        return {
          result: result instanceof Promise ? result.then(fn) : fn(result),
          vanish,
        };
      }
    })();
  }

  /** Chains this Matter with a function that returns another Matter. */
  public flatMap<U>(fn: (result: T) => Matter<U>): Matter<U> {
    const materialize = this.materialize.bind(this);
    return new (class extends Matter<U> {
      materialize(): Presence<U> {
        const { result, vanish } = materialize();
        let innerVanish: (() => MaybePromise<void>) | undefined;
        let isVanished = false;
        let innerResult: MaybePromise<U>;

        if (result instanceof Promise) {
          innerResult = result.then(val => {
            if (isVanished) {
              throw new Error('Matter vanished');
            }
            const inner = fn(val).materialize();
            innerVanish = inner.vanish;
            return inner.result;
          });
        } else {
          const inner = fn(result).materialize();
          innerVanish = inner.vanish;
          innerResult = inner.result;
        }
        return {
          result: innerResult,
          vanish: (): MaybePromise<void> => {
            isVanished = true;
            if (innerVanish) {
              const res = innerVanish();
              if (res instanceof Promise) {
                return res.then(vanish);
              }
            }
            return vanish();
          },
        };
      }
    })();
  }

  /** Creates a Matter that immediately resolves to the given value with no cleanup. */
  public static pure<T>(value: T): Matter<T> {
    return new (class extends Matter<T> {
      materialize(): Presence<T> {
        return {
          result: value,
          vanish: () => undefined,
        };
      }
    })();
  }

  /** Materializes all given Matters in parallel and collects their results. */
  public static parSequence<T extends unknown[]>(matters: {
    [K in keyof T]: Matter<T[K]>;
  }): Matter<T> {
    return new (class extends Matter<T> {
      materialize(): Presence<T> {
        const initializeResults = matters.map(matter => {
          return matter.materialize();
        });
        const results = initializeResults.map(result => result.result);
        const vanishes = initializeResults.map(result => result.vanish);
        return {
          result: results.some(result => result instanceof Promise)
            ? (Promise.all(results) as Promise<T>)
            : (results as T),
          vanish: (): MaybePromise<void> => {
            const vanishResults = vanishes.map(vanish => vanish());
            return vanishResults.some(result => result instanceof Promise)
              ? Promise.all(vanishResults).then(() => {})
              : undefined;
          },
        };
      }
    })();
  }

  /** Materializes this Matter and another in parallel, returning both results as a tuple. */
  public parZip<U>(other: Matter<U>): Matter<[T, U]> {
    const materialize = this.materialize.bind(this);
    return new (class extends Matter<[T, U]> {
      materialize(): Presence<[T, U]> {
        const { result: resultA, vanish: vanishA } = materialize();
        const { result: resultB, vanish: vanishB } = other.materialize();
        const result =
          resultA instanceof Promise || resultB instanceof Promise
            ? (Promise.all([resultA, resultB]) as Promise<[T, U]>)
            : ([resultA, resultB] as [T, U]);
        return {
          result,
          vanish: (): MaybePromise<void> => {
            const vanishResults = [vanishA(), vanishB()];
            return vanishResults.some(result => result instanceof Promise)
              ? Promise.all(vanishResults).then(() => {})
              : undefined;
          },
        };
      }
    })();
  }

  /** Creates a Matter from a Presence class constructor. */
  public static ofClass<T, Args extends unknown[]>(
    Cls: PresenceClass<T, Args>,
    ...args: Args
  ): Matter<T> {
    return new (class extends Matter<T> {
      materialize(): Presence<T> {
        const instance = new Cls(...args);
        const { result, vanish } = instance;
        return {
          result,
          vanish,
        };
      }
    })();
  }
}

// ============================================================================
// Core Matter Constructors
// ============================================================================

/**
 * A Matter subclass for side effects with lifecycle management.
 * Register cleanup functions via `addFinalizeFn` (called in reverse order on vanish).
 */
export class Effect<T> extends Matter<T> {
  materialize(): Presence<T> {
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

    const vanish = (): MaybePromise<void> => {
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
      vanish,
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
