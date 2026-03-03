import { Field } from '../field';
import { Interaction, Operator, Excitation } from '../operator';
import { Dimension, Trie } from '../trie';
import { MaybePromise } from '../util';
import { BaseField } from './base';

/**
 * A dynamic multi-value reactive state container with indexed entries.
 * Values can be connected and disconnected dynamically via `connect()`.
 */
export class Bridge<P extends Dimension, V>
  extends BaseField<P, V>
  implements Excitation<Bridge<P, V>>
{
  private currentFilledCoordinates = new Trie<P, V>();

  constructor() {
    super();
  }

  /** Connects a value to this Bridge. The value is disconnected when the returned Operator is decayed. */
  connect(coodinate: P, val: V): Operator<void> {
    return new Interaction(addFinalizeFn => {
      if (this.currentFilledCoordinates.has(coodinate)) {
        console.warn(`Coordinate ${coodinate} is already filled`);
      } else {
        this.currentFilledCoordinates.set(coodinate, val);
        super._set(coodinate, val);
        addFinalizeFn(() => {
          this.currentFilledCoordinates.delete(coodinate);
          return super._unset(coodinate);
        });
      }
    });
  }

  /** Returns a snapshot of all currently connected values. */
  items(): readonly V[] {
    return Array.from(this.currentFilledCoordinates.values());
  }

  /** Casts a Field through a Bridge, returning a Operator that resolves to the Bridge as a Field. */
  static cast<P extends Dimension, T>(
    field: Field<P, T>
  ): Operator<Field<P, T>> {
    return Operator.ofClass(Bridge<P, T>).flatMap(bridge =>
      field
        .couple((val, coodinate) => bridge.connect(coodinate, val))
        .map(() => bridge)
    );
  }
  result = this;

  decay(): MaybePromise<void> {
    return super._decay();
  }
}
