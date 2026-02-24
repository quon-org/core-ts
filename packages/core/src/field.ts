import { Matter } from './matter';

/**
 * Field represents a reactive source that couples listeners to emitted values via Matter.
 */
export abstract class Field<V> {
  /** Couples a listener to this Field. The listener is called for each emitted value. */
  public abstract couple(listener: (val: V) => Matter<void>): Matter<void>;

  /** Converts this Field to a Matter, ignoring emitted values. */
  public asMatter(): Matter<void> {
    return this.couple(() => Matter.pure(undefined));
  }

  /** Transforms emitted values using the given function. */
  public map<U>(fn: (val: V) => U): Field<U> {
    const couple = this.couple.bind(this);
    return new (class extends Field<U> {
      couple(listener: (val: U) => Matter<void>): Matter<void> {
        return couple(val => {
          const newVal = fn(val);
          return listener(newVal);
        });
      }
    })();
  }

  /** Chains this Field with a function that returns another Field. */
  public flatMap<U>(fn: (val: V) => Field<U>): Field<U> {
    const couple = this.couple.bind(this);
    return new (class extends Field<U> {
      couple(listener: (val: U) => Matter<void>): Matter<void> {
        return couple(val => {
          const newField = fn(val);
          return newField.couple(listener);
        });
      }
    })();
  }

  /** Filters emitted values, only passing through those that satisfy the predicate. */
  public filter<S extends V>(predicate: (val: V) => val is S): Field<S>;
  public filter(predicate: (val: V) => boolean): Field<V> {
    const couple = this.couple.bind(this);
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        return couple(val => {
          if (predicate(val)) {
            return listener(val);
          }
          return Matter.pure(undefined);
        });
      }
    })();
  }

  /** Merges multiple Fields into one, emitting values from all of them in parallel. */
  public static concat<T>(fields: Field<T>[]): Field<T> {
    return new (class extends Field<T> {
      couple(listener: (val: T) => Matter<void>): Matter<void> {
        const matters = fields.map(field => field.couple(listener));
        return Matter.parSequence(matters).map(() => undefined);
      }
    })();
  }

  /** Merges this Field with another, emitting values from both in parallel. */
  public append(other: Field<V>): Field<V> {
    const couple = this.couple.bind(this);
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        const matters = [couple(listener), other.couple(listener)];
        return Matter.parSequence(matters).map(() => undefined);
      }
    })();
  }

  /** Creates a Field that emits a single value. */
  public static pure<V>(val: V): Field<V> {
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        return listener(val);
      }
    })();
  }

  /** Creates a Field from a Matter, emitting the Matter's result as a single value. */
  public static ofMatter<V>(r: Matter<V>): Field<V> {
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        return r.flatMap(val => listener(val));
      }
    })();
  }

  /** Creates a Field that never emits any value. */
  public static empty<V>(): Field<V> {
    return new (class extends Field<V> {
      couple(): Matter<void> {
        return Matter.pure(undefined);
      }
    })();
  }
}
