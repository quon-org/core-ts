import { ReadonlyCollection } from '../field';
import { EffectResource, Resource, Instance } from '../resource';
import { Dimension } from '../trie';
import { MaybePromise } from '../util';
import { BaseField } from './base';

/**
 * A dynamic multi-value reactive state container with indexed entries.
 * Values can be connected and disconnected dynamically via `connect()`.
 */
export class Bridge<P extends Dimension, V>
  extends BaseField<P, V>
  implements Instance<Bridge<P, V>>
{
  constructor() {
    super();
  }

  /** Connects a value to this Bridge. The value is disconnected when the returned Operator is decayed. */
  connect(coodinate: P, val: V): Resource<void> {
    return new EffectResource(addFinalizeFn => {
      if (this.currentValues.has(coodinate)) {
        console.warn(`Coordinate ${coodinate} is already filled`);
      } else {
        this.currentValues.set(coodinate, val);
        super._set(coodinate, val);
        addFinalizeFn(() => {
          this.currentValues.delete(coodinate);
          return super._unset(coodinate);
        });
      }
    });
  }

  /** Returns a snapshot of all currently connected values. */
  items(): readonly V[] {
    return Array.from(this.currentValues.values());
  }

  /** Casts a Field through a Bridge, returning a Operator that resolves to the Bridge as a Field. */
  static cast<P extends Dimension, T>(
    field: ReadonlyCollection<P, T>
  ): Resource<ReadonlyCollection<P, T>> {
    return Resource.ofClass(Bridge<P, T>).flatMap(bridge =>
      field
        .couple((val, coodinate) => bridge.connect(coodinate, val))
        .map(() => bridge)
    );
  }
  result = this;

  release(): MaybePromise<void> {
    return super._decay();
  }
}
