import { Operator } from './operator';
import { Dimension, ZeroDimension } from './trie';

export type Scalar<V> = Field<ZeroDimension, V>;

/**
 * Field represents a reactive source that couples listeners to emitted values via Operator.
 */
export abstract class Field<P extends Dimension, V> {
  /** Couples a listener to this Field. The listener is called for each emitted value. */
  public abstract couple(
    listener: (val: V, coodinate: P) => Operator<void>
  ): Operator<void>;

  /** Converts this Field to a Operator, ignoring emitted values. */
  public asOperator(): Operator<void> {
    return this.couple(() => Operator.pure(undefined));
  }

  /** Transforms emitted values using the given function. */
  public map<U>(fn: (val: V, coordinate: P) => U): Field<P, U> {
    const couple = this.couple.bind(this);
    return new (class extends Field<P, U> {
      couple(
        listener: (val: U, coodinate: P) => Operator<void>
      ): Operator<void> {
        return couple((val, coodinate) => {
          const newVal = fn(val, coodinate);
          return listener(newVal, coodinate);
        });
      }
    })();
  }

  /** Chains this Field with a function that returns another Field. */
  public flatMap<Q extends Dimension, U>(
    fn: (val: V, coodinate: P) => Field<Q, U>
  ): Field<readonly [...P, ...Q], U> {
    const couple = this.couple.bind(this);
    return new (class extends Field<readonly [...P, ...Q], U> {
      couple(
        listener: (val: U, coodinate: readonly [...P, ...Q]) => Operator<void>
      ): Operator<void> {
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
  ): Field<P, S>;
  public filter(predicate: (val: V, coodinate: P) => boolean): Field<P, V>;
  public filter(predicate: (val: V, coodinate: P) => boolean): Field<P, V> {
    const couple = this.couple.bind(this);
    return new (class extends Field<P, V> {
      couple(
        listener: (val: V, coodinate: P) => Operator<void>
      ): Operator<void> {
        return couple((val, coodinate) => {
          if (predicate(val, coodinate)) {
            return listener(val, coodinate);
          }
          return Operator.pure(undefined);
        });
      }
    })();
  }

  public filterCoordinate<S extends P>(
    predicate: (coodinate: P) => coodinate is S
  ): Field<S, V>;
  public filterCoordinate(predicate: (coodinate: P) => boolean): Field<P, V> {
    const couple = this.couple.bind(this);
    return new (class extends Field<P, V> {
      couple(
        listener: (val: V, coodinate: P) => Operator<void>
      ): Operator<void> {
        return couple((val, coodinate) => {
          if (predicate(coodinate)) {
            return listener(val, coodinate);
          }
          return Operator.pure(undefined);
        });
      }
    })();
  }

  public get(coodinate: P): Scalar<V> {
    const couple = this.couple.bind(this);
    return new (class extends Field<ZeroDimension, V> {
      couple(
        listener: (val: V, coodinate: ZeroDimension) => Operator<void>
      ): Operator<void> {
        return couple((val, emittedCoodinate) => {
          if (
            emittedCoodinate.length === coodinate.length &&
            emittedCoodinate.every((part, idx) => part === coodinate[idx])
          ) {
            return listener(val, []);
          }
          return Operator.pure(undefined);
        });
      }
    })();
  }

  /** Merges multiple Fields into one, emitting values from all of them in parallel. */
  public static concat<P extends Dimension, T>(
    fields: readonly Field<P, T>[]
  ): Field<readonly [...P, number], T> {
    return new (class extends Field<readonly [...P, number], T> {
      couple(
        listener: (
          val: T,
          coordinate: readonly [...P, number]
        ) => Operator<void>
      ): Operator<void> {
        const operators = fields.map((field, idx) =>
          field.couple((val, coodinate) => {
            const combinedKey = [...coodinate, idx] as const;
            return listener(val, combinedKey);
          })
        );
        return Operator.parSequence(operators).map(() => undefined);
      }
    })();
  }

  /** Creates a Field that emits a single value. */
  public static pure<V>(val: V): Scalar<V> {
    return new (class extends Field<ZeroDimension, V> {
      couple(
        listener: (val: V, coordinate: ZeroDimension) => Operator<void>
      ): Operator<void> {
        return listener(val, []);
      }
    })();
  }

  /** Creates a Field from a Operator, emitting the Operator's result as a single value. */
  public static ofOperator<V>(r: Operator<V>): Scalar<V> {
    return new (class extends Field<ZeroDimension, V> {
      couple(
        listener: (val: V, coordinate: ZeroDimension) => Operator<void>
      ): Operator<void> {
        return r.flatMap(val => listener(val, []));
      }
    })();
  }

  /** Creates a Field that never emits any value. */
  public static empty<P extends Dimension, V>(): Field<P, V> {
    return new (class extends Field<P, V> {
      couple(): Operator<void> {
        return Operator.pure(undefined);
      }
    })();
  }
}
