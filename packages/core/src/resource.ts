import { MaybePromise } from './util';

/**
 * Represents a exicited Resource with a result and a cleanup function.
 */
export interface Instance<T> {
  /** The result value, possibly asynchronous. */
  result: MaybePromise<T>;
  /** Cleanup function to release resources. */
  release(this: void): MaybePromise<void>;
}

export type InstanceClass<T, Args extends unknown[]> = new (
  ...args: Args
) => Instance<T>;

/**
 * Resource represents an object that has a lifecycle (exicite/decay).
 */
export abstract class Resource<T> {
  /** Materializes this Resource, producing a Excitation with a result and cleanup function. */
  public abstract aquire(): Instance<T>;

  /** Transforms the result of this Resource using the given function. */
  public map<U>(fn: (result: T) => U): Resource<U> {
    const aquireParent = this.aquire.bind(this);
    return new (class extends Resource<U> {
      aquire(): Instance<U> {
        const instance = aquireParent();
        return {
          result:
            instance.result instanceof Promise
              ? instance.result.then(fn)
              : fn(instance.result),
          release: instance.release,
        };
      }
    })();
  }

  /** Chains this Resource with a function that returns another Resource. */
  public flatMap<U>(fn: (result: T) => Resource<U>): Resource<U> {
    const parentAquire = this.aquire.bind(this);
    return new (class extends Resource<U> {
      aquire(): Instance<U> {
        const instance = parentAquire();
        let releaseChild: (() => MaybePromise<void>) | undefined;
        let isReleased = false;
        let childResult: MaybePromise<U>;

        if (instance.result instanceof Promise) {
          childResult = instance.result.then(val => {
            if (isReleased) {
              throw new Error('Resource released');
            }
            const inner = fn(val).aquire();
            releaseChild = (): MaybePromise<void> => inner.release();
            return inner.result;
          });
        } else {
          const inner = fn(instance.result).aquire();
          releaseChild = (): MaybePromise<void> => inner.release();
          childResult = inner.result;
        }
        return {
          result: childResult,
          release: (): MaybePromise<void> => {
            isReleased = true;
            if (releaseChild) {
              const res = releaseChild();
              if (res instanceof Promise) {
                return res.then(instance.release);
              }
            }
            return instance.release();
          },
        };
      }
    })();
  }

  /** Creates a Resource that immediately resolves to the given value with no cleanup. */
  public static pure<T>(value: T): Resource<T> {
    return new (class extends Resource<T> {
      aquire(): Instance<T> {
        return {
          result: value,
          release: () => undefined,
        };
      }
    })();
  }

  /** Materializes all given Resources in parallel and collects their results. */
  public static all<T extends unknown[]>(resources: {
    [K in keyof T]: Resource<T[K]>;
  }): Resource<T> {
    return new (class extends Resource<T> {
      aquire(): Instance<T> {
        const instances = resources.map(resource => resource.aquire());
        const results = instances.map(instance => instance.result);
        const releases = instances.map(instance => instance.release);
        return {
          result: results.some(result => result instanceof Promise)
            ? (Promise.all(results) as Promise<T>)
            : (results as T),
          release: (): MaybePromise<void> => {
            const releasings = releases.map(release => release());
            return releasings.some(release => release instanceof Promise)
              ? Promise.all(releasings).then(() => {})
              : undefined;
          },
        };
      }
    })();
  }

  /** Creates a Resource from a Excitation class constructor. */
  public static ofClass<T, Args extends unknown[]>(
    Cls: InstanceClass<T, Args>,
    ...args: Args
  ): Resource<T> {
    return new (class extends Resource<T> {
      aquire(): Instance<T> {
        return new Cls(...args);
      }
    })();
  }
}

// ============================================================================
// Core Resource Constructors
// ============================================================================

/**
 * A Resource subclass for side effects with lifecycle management.
 * Register cleanup functions via `addFinalizeFn` (called in reverse order on decay).
 */
export class Effect<T> extends Resource<T> {
  aquire(): Instance<T> {
    const finalizeFns: Array<() => MaybePromise<void>> = [];

    const isReleased = false;
    let releasing: MaybePromise<void> | undefined;
    const resultMaybePromise = this.initializeFn(finalizeFn => {
      finalizeFns.push(finalizeFn);
    });

    const result =
      resultMaybePromise instanceof Promise
        ? resultMaybePromise.then(v => {
            if (isReleased) {
              throw new Error('Resource released');
            }
            return v;
          })
        : resultMaybePromise;

    const release = (): MaybePromise<void> => {
      if (isReleased) return releasing;

      const releasings = finalizeFns.map(fn => fn());
      if (releasings.some(r => r instanceof Promise)) {
        releasing = Promise.all(releasings).then(() => {});
      }

      return releasing;
    };
    return {
      result,
      release,
    };
  }

  constructor(
    private initializeFn: (
      addFinalizeFn: (finalizeFn: () => MaybePromise<void>) => void
    ) => MaybePromise<T>
  ) {
    super();
  }
}

export class UniqueId extends Resource<symbol> {
  constructor(private description?: string) {
    super();
  }

  aquire(): Instance<symbol> {
    const id = Symbol(this.description);
    return {
      result: id,
      release: () => undefined,
    };
  }
}
