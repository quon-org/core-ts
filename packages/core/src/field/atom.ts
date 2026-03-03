import { Excitation } from '../operator';
import { MaybePromise } from '../util';
import { BaseField } from './base';

/**
 * A managed single-value reactive state container.
 * Updates via `set()` or `modify()` trigger re-execution of coupled listeners.
 */
export class Atom<V>
  extends BaseField<readonly [], V>
  implements Excitation<Atom<V>>
{
  private currentValue: V;

  constructor(initValue: V) {
    super();
    this.currentValue = initValue;
    super._set([], initValue);
  }

  /** Updates the current value using a modifier function. No-op if the value is unchanged (by reference). */
  public modify(modifier: (val: V) => V): MaybePromise<void> {
    const nextValue = modifier(this.currentValue);
    this.currentValue = nextValue;
    return super._set([], nextValue);
  }

  /** Replaces the current value. No-op if the value is unchanged (by reference). */
  public set(val: V): MaybePromise<void> {
    this.currentValue = val;
    return super._set([], val);
  }

  /** Returns the current value without creating a subscription. */
  public peek(): V {
    return this.currentValue;
  }

  result = this;

  decay(): MaybePromise<void> {
    return super._decay();
  }
}
