import { BiLinkMap } from '../bilink-map';
import { Field } from '../field';
import { Effect, Matter, Presence } from '../matter';
import { MaybePromise } from '../util';

/**
 * A dynamic multi-value reactive state container with indexed entries.
 * Values can be connected and disconnected dynamically via `connect()`.
 */
export class Portal<V> extends Field<V> implements Presence<Portal<V>> {
  private biLinks = new BiLinkMap<number, (val: V) => Matter<void>>();
  private keyToValue = new Map<number, V>();
  private nextKey = 0;

  constructor() {
    super();
  }

  couple(listener: (val: V) => Matter<void>): Matter<void> {
    return new Effect(addFinalizeFn => {
      // Connect to all existing entries
      this.biLinks.linkAllB(listener, key => {
        return listener(this.keyToValue.get(key)!);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  /** Connects a value to this Portal. The value is disconnected when the returned Matter is vanished. */
  connect(val: V): Matter<void> {
    return new Effect(addFinalizeFn => {
      const key = this.nextKey++;
      this.keyToValue.set(key, val);
      this.biLinks.linkAllA(key, listener => {
        return listener(val);
      });
      addFinalizeFn(() => {
        this.keyToValue.delete(key);
        return this.biLinks.unlinkAllA(key);
      });
    });
  }

  /** Returns a snapshot of all currently connected values. */
  items(): readonly V[] {
    return Array.from(this.keyToValue.values());
  }

  result: MaybePromise<Portal<V>> = this;
  vanish = (): MaybePromise<void> => {
    this.keyToValue.clear();
    return this.biLinks.unlinkAll();
  };

  /** Casts a Field through a Portal, returning a Matter that resolves to the Portal as a Field. */
  static cast<T>(field: Field<T>): Matter<Field<T>> {
    return Matter.ofClass(Portal<T>).flatMap(nexus =>
      field.couple(val => nexus.connect(val)).map(() => nexus)
    );
  }
}
