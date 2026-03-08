import { Resource } from './resource';
import { Dimension, ZeroDimension } from './trie';

export type Scalar<V> = ReadonlyCollection<ZeroDimension, V>;

/**
 * Field represents a reactive source that couples listeners to emitted values via Operator.
 */
export abstract class ReadonlyCollection<P extends Dimension, V> {
  /** Couples a listener to this Field. The listener is called for each emitted value. */
  public abstract couple(
    listener: (val: V, coodinate: P) => Resource<void>
  ): Resource<void>;

  /** Converts this Field to a Operator, ignoring emitted values. */
  public asOperator(): Resource<void> {
    return this.couple(() => Resource.pure(undefined));
  }

  /** Transforms emitted values using the given function. */
  public map<U>(fn: (val: V, coordinate: P) => U): ReadonlyCollection<P, U> {
    const couple = this.couple.bind(this);
    return new (class extends ReadonlyCollection<P, U> {
      couple(
        listener: (val: U, coodinate: P) => Resource<void>
      ): Resource<void> {
        return couple((val, coodinate) => {
          const newVal = fn(val, coodinate);
          return listener(newVal, coodinate);
        });
      }
    })();
  }

  /** Chains this Field with a function that returns another Field. */
  public flatMap<Q extends Dimension, U>(
    fn: (val: V, coodinate: P) => ReadonlyCollection<Q, U>
  ): ReadonlyCollection<readonly [...P, ...Q], U> {
    const couple = this.couple.bind(this);
    return new (class extends ReadonlyCollection<readonly [...P, ...Q], U> {
      couple(
        listener: (val: U, coodinate: readonly [...P, ...Q]) => Resource<void>
      ): Resource<void> {
        return couple((val, coodinate) => {
          const newField = fn(val, coodinate);
          return newField.couple((newVal, newCoodinate) => {
            const combinedKey = [...coodinate, ...newCoodinate] as const;
            return listener(newVal, combinedKey);
          });
        });
      }
    })();
  }

  // public flatMap<U>

  /** Filters emitted values, only passing through those that satisfy the predicate. */
  public filter<S extends V>(
    predicate: (val: V, coodinate: P) => val is S
  ): ReadonlyCollection<P, S>;
  public filter(
    predicate: (val: V, coodinate: P) => boolean
  ): ReadonlyCollection<P, V>;
  public filter(
    predicate: (val: V, coodinate: P) => boolean
  ): ReadonlyCollection<P, V> {
    const couple = this.couple.bind(this);
    return new (class extends ReadonlyCollection<P, V> {
      couple(
        listener: (val: V, coodinate: P) => Resource<void>
      ): Resource<void> {
        return couple((val, coodinate) => {
          if (predicate(val, coodinate)) {
            return listener(val, coodinate);
          }
          return Resource.pure(undefined);
        });
      }
    })();
  }

  public filterCoordinate<S extends P>(
    predicate: (coodinate: P) => coodinate is S
  ): ReadonlyCollection<S, V>;
  public filterCoordinate(
    predicate: (coodinate: P) => boolean
  ): ReadonlyCollection<P, V> {
    const couple = this.couple.bind(this);
    return new (class extends ReadonlyCollection<P, V> {
      couple(
        listener: (val: V, coodinate: P) => Resource<void>
      ): Resource<void> {
        return couple((val, coodinate) => {
          if (predicate(coodinate)) {
            return listener(val, coodinate);
          }
          return Resource.pure(undefined);
        });
      }
    })();
  }

  public get(coodinate: P): Scalar<V> {
    const couple = this.couple.bind(this);
    return new (class extends ReadonlyCollection<ZeroDimension, V> {
      couple(
        listener: (val: V, coodinate: ZeroDimension) => Resource<void>
      ): Resource<void> {
        return couple((val, emittedCoodinate) => {
          if (
            emittedCoodinate.length === coodinate.length &&
            emittedCoodinate.every((part, idx) => part === coodinate[idx])
          ) {
            return listener(val, []);
          }
          return Resource.pure(undefined);
        });
      }
    })();
  }

  /** Merges multiple Fields into one, emitting values from all of them in parallel. */
  public static concat<P extends Dimension, T>(
    fields: readonly ReadonlyCollection<P, T>[]
  ): ReadonlyCollection<readonly [...P, number], T> {
    return new (class extends ReadonlyCollection<readonly [...P, number], T> {
      couple(
        listener: (
          val: T,
          coordinate: readonly [...P, number]
        ) => Resource<void>
      ): Resource<void> {
        const operators = fields.map((field, idx) =>
          field.couple((val, coodinate) => {
            const combinedKey = [...coodinate, idx] as const;
            return listener(val, combinedKey);
          })
        );
        return Resource.all(operators).map(() => undefined);
      }
    })();
  }

  /** Creates a Field that emits a single value. */
  public static pure<V>(val: V): Scalar<V> {
    return new (class extends ReadonlyCollection<ZeroDimension, V> {
      couple(
        listener: (val: V, coordinate: ZeroDimension) => Resource<void>
      ): Resource<void> {
        return listener(val, []);
      }
    })();
  }

  /** Creates a Field from a Operator, emitting the Operator's result as a single value. */
  public static ofOperator<V>(r: Resource<V>): Scalar<V> {
    return new (class extends ReadonlyCollection<ZeroDimension, V> {
      couple(
        listener: (val: V, coordinate: ZeroDimension) => Resource<void>
      ): Resource<void> {
        return r.flatMap(val => listener(val, []));
      }
    })();
  }

  /** Creates a Field that never emits any value. */
  public static empty<P extends Dimension, V>(): ReadonlyCollection<P, V> {
    return new (class extends ReadonlyCollection<P, V> {
      couple(): Resource<void> {
        return Resource.pure(undefined);
      }
    })();
  }
}
