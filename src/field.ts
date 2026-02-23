import { Matter } from '@/matter';

/**
 * Field represents a reactive source that couples listeners to emitted values via Matter.
 */
export abstract class Field<V> {
  public abstract couple(listener: (val: V) => Matter<void>): Matter<void>;

  public asMatter(): Matter<void> {
    return this.couple(() => Matter.pure(undefined));
  }

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

  public static concat<T>(fields: Field<T>[]): Field<T> {
    return new (class extends Field<T> {
      couple(listener: (val: T) => Matter<void>): Matter<void> {
        const matters = fields.map(field => field.couple(listener));
        return Matter.parSequence(matters).map(() => undefined);
      }
    })();
  }

  public append(other: Field<V>): Field<V> {
    const couple = this.couple.bind(this);
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        const matters = [couple(listener), other.couple(listener)];
        return Matter.parSequence(matters).map(() => undefined);
      }
    })();
  }

  public static pure<V>(val: V): Field<V> {
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        return listener(val);
      }
    })();
  }

  public static ofMatter<V>(r: Matter<V>): Field<V> {
    return new (class extends Field<V> {
      couple(listener: (val: V) => Matter<void>): Matter<void> {
        return r.flatMap(val => listener(val));
      }
    })();
  }
}
