import { BiLinkMap } from '../bilink-map';
import { Field } from '../field';
import { Effect, Matter, Presence } from '../matter';
import { MaybePromise } from '../util';

/**
 * A dynamic set-based reactive state container.
 * Values can be added and removed by identity.
 */
export class Ensemble<V> extends Field<V> implements Presence<Ensemble<V>> {
  private biLinks = new BiLinkMap<V, (val: V) => Matter<void>>();

  constructor() {
    super();
  }

  couple(listener: (val: V) => Matter<void>): Matter<void> {
    return new Effect(addFinalizeFn => {
      // Connect to all existing entries
      this.biLinks.linkAllB(listener, val => {
        return listener(val);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  /** Adds a value to the set, notifying all coupled listeners. */
  add(val: V): void {
    this.biLinks.linkAllA(val, listener => {
      return listener(val);
    });
  }

  /** Removes a value from the set, cleaning up associated listeners. */
  async remove(val: V): Promise<void> {
    await this.biLinks.unlinkAllA(val);
  }

  /** Removes all values that satisfy the predicate. */
  async removeIf(
    predicate: (val: V) => boolean | Promise<boolean>
  ): Promise<void> {
    const items = this.items();
    for (const item of items) {
      if (await predicate(item)) {
        await this.remove(item);
      }
    }
  }

  /** Returns a snapshot of all current values. */
  items(): readonly V[] {
    return Array.from(this.biLinks.getAs());
  }

  result: MaybePromise<Ensemble<V>> = this;
  vanish = (): MaybePromise<void> => {
    return this.biLinks.unlinkAll();
  };
}
