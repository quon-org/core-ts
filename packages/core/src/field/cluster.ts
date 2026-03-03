import { Excitation } from '../operator';
import { Trie } from '../trie';
import { MaybePromise } from '../util';
import { BaseField } from './base';

/**
 * A dynamic set-based reactive state container.
 * Values can be added and removed by identity.
 */
export class Cluster<P extends unknown[], V>
  extends BaseField<P, V>
  implements Excitation<Cluster<P, V>>
{
  private currentFilledCoordinates = new Trie<P, V>();

  constructor() {
    super();
  }

  /** Returns a snapshot of all currently connected values. */
  public items(): readonly V[] {
    return Array.from(this.currentFilledCoordinates.values());
  }

  /** Adds a value to the set, notifying all coupled listeners. */
  public set(coodinate: readonly [...P], val: V): MaybePromise<void> {
    this.currentFilledCoordinates.set(coodinate, val);
    return super._set(coodinate, val);
  }

  /** Removes a value from the set, cleaning up associated listeners. */
  public delete(coodinate: readonly [...P]): MaybePromise<void> {
    if (this.currentFilledCoordinates.has(coodinate)) {
      this.currentFilledCoordinates.delete(coodinate);
      return super._unset(coodinate);
    }
  }

  /** Removes all values that satisfy the predicate. */
  public deleteIf(
    predicate: (val: V, coodinate: readonly [...P]) => boolean
  ): MaybePromise<void> {
    const deletePromises: Promise<void>[] = [];
    const trieEntries = [...this.currentFilledCoordinates.entries()];
    for (const [coodinate, val] of trieEntries) {
      if (predicate(val, coodinate)) {
        const deleteResult = this.delete(coodinate);
        if (deleteResult instanceof Promise) {
          deletePromises.push(deleteResult);
        }
      }
    }
    if (deletePromises.length > 0) {
      return Promise.all(deletePromises).then(() => undefined);
    }
    return;
  }

  result = this;

  decay(): MaybePromise<void> {
    return super._decay();
  }
}
