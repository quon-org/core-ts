import { MaybePromise } from './util';

export type Fiber<T> = {
  result: MaybePromise<T>;
};

/**
 * Resource represents a object that has a lifecycle (initialize/finalize).
 */
export type Resource<T> = {
  initialize: () => {
    result: MaybePromise<T>;
    finalize: () => MaybePromise<void>;
  };
};

// ============================================================================
// Core Resource Constructors
// ============================================================================

/**
 * Creates a basic Resource from an initialize function.
 */
export function make<T>(
  initializeFn: () => {
    result: MaybePromise<T>;
    finalize: () => MaybePromise<void>;
  }
): Resource<T> {
  return {
    initialize: initializeFn,
  };
}

/**
 * Creates an Effect (Resource with side effects and cleanup).
 */
export function effect<T>(
  initializeFn: (
    addFinalizeFn: (finalizeFn: () => MaybePromise<void>) => void,
    abortSignal: AbortSignal
  ) => MaybePromise<T>
): Resource<T> {
  return {
    initialize: (): {
      result: MaybePromise<T>;
      finalize: () => MaybePromise<void>;
    } => {
      const finalizeFns: Array<() => MaybePromise<void>> = [];
      const abortController = new AbortController();

      let isFinalized = false;
      let cleanupResult: MaybePromise<void>;

      const resultMaybePromise = initializeFn(finalizeFn => {
        finalizeFns.push(finalizeFn);
      }, abortController.signal);

      const resultPromise =
        resultMaybePromise instanceof Promise
          ? resultMaybePromise.then(v => {
              if (isFinalized) throw new Error('Effect: Resource finalized');
              return v;
            })
          : resultMaybePromise;

      const finalize = (): MaybePromise<void> => {
        if (isFinalized) return cleanupResult;
        isFinalized = true;

        abortController.abort();

        let chain: Promise<void> | undefined;

        // finalizeFns を逆順実行
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
        result: resultPromise,
        finalize,
      };
    },
  };
}

// ============================================================================
// Resource Transformation Functions
// ============================================================================

/**
 * Maps the result of a Resource.
 */
export function map<T, U>(
  Resource: Resource<T>,
  fn: (result: T) => U
): Resource<U> {
  return make(() => {
    const { result, finalize } = Resource.initialize();
    return {
      result: result instanceof Promise ? result.then(fn) : fn(result),
      finalize,
    };
  });
}

/**
 * Chains two Resources (flatMap/bind).
 */
export function then<T, U>(
  Resource: Resource<T>,
  fn: (result: T) => Resource<U>
): Resource<U> {
  return make(() => {
    const { result, finalize } = Resource.initialize();
    let innerFinalize: (() => MaybePromise<void>) | undefined;
    let isFinalized = false;
    let innerResult: MaybePromise<U>;

    if (result instanceof Promise) {
      innerResult = result.then(val => {
        if (isFinalized) {
          throw new Error('Resource finalized');
        }
        const inner = fn(val).initialize();
        innerFinalize = inner.finalize;
        return inner.result;
      });
    } else {
      const inner = fn(result).initialize();
      innerFinalize = inner.finalize;
      innerResult = inner.result;
    }
    return {
      result: innerResult,
      finalize: (): MaybePromise<void> => {
        isFinalized = true;
        if (innerFinalize) {
          const res = innerFinalize();
          if (res instanceof Promise) {
            return res.then(finalize);
          }
        }
        return finalize();
      },
    };
  });
}

// ============================================================================
// Resource Static Utilities
// ============================================================================

/**
 * Creates a Resource that resolves immediately with a value.
 */
export function resolve<T>(value: T): Resource<T> {
  return {
    initialize: (): {
      result: MaybePromise<T>;
      finalize: () => MaybePromise<void>;
    } => {
      return {
        result: value,
        finalize: () => undefined,
      };
    },
  };
}

/**
 * Runs multiple Resources in parallel and returns all results.
 */
export function all<T extends unknown[]>(Resources: {
  [K in keyof T]: Resource<T[K]>;
}): Resource<T> {
  return {
    initialize: (): {
      result: MaybePromise<T>;
      finalize: () => MaybePromise<void>;
    } => {
      const initializeResults = Resources.map(Resource => {
        return Resource.initialize();
      });
      const results = initializeResults.map(result => result.result);
      const finalizes = initializeResults.map(result => result.finalize);
      return {
        result: results.some(result => result instanceof Promise)
          ? (Promise.all(results) as Promise<T>)
          : (results as T),
        finalize: (): MaybePromise<void> => {
          const finalizeResults = finalizes.map(finalize => finalize());
          return finalizeResults.some(result => result instanceof Promise)
            ? Promise.all(finalizeResults).then(() => {})
            : undefined;
        },
      };
    },
  };
}

/**
 * Forks a Resource into a background task (Fiber).
 */
export function fork<T>(Resource: Resource<T>): Resource<Fiber<T>> {
  return make(() => {
    const { result, finalize } = Resource.initialize();
    return {
      result: { result },
      finalize,
    };
  });
}

/**
 * Joins a Fiber, waiting for its result.
 */
export function join<T>(fiber: Fiber<T>): Resource<T> {
  return make(() => {
    return {
      result: fiber.result,
      finalize: (): MaybePromise<void> => {},
    };
  });
}
