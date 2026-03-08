import { Coalescer } from '../coalescer';
import { Instance } from '../resource';
import { Structural } from '../structual';
import { ZeroDimension } from '../trie';
import { MaybePromise } from '../util';
import { BaseField } from './base';

type AtomMutationEvent<V> =
  | {
      type: 'set';
      val: V;
    }
  | {
      type: 'modify';
      modifier: (val: V) => V;
    };

/**
 * A managed single-value reactive state container.
 * Updates via `set()` or `modify()` trigger re-execution of coupled listeners.
 */
export class Atom<V extends Structural>
  extends BaseField<ZeroDimension, V>
  implements Instance<Atom<V>>
{
  private currentValue: V;
  // 同期的なイベントの連鎖をまとめる
  private coalescer = new Coalescer<AtomMutationEvent<V>>();

  constructor(initValue: V) {
    super();
    this.currentValue = initValue;
    super._set([], initValue);
    this.coalescer.subscribe(evs => this.processCoalescer(evs));
  }

  private processCoalescer(evs: AtomMutationEvent<V>[]): void {
    let nextValue = this.currentValue;
    for (const ev of evs) {
      if (ev.type === 'set') {
        nextValue = ev.val;
      } else if (ev.type === 'modify') {
        nextValue = ev.modifier(nextValue);
      }
    }
    if (nextValue === this.currentValue) {
      return;
    }
    this.currentValue = nextValue;
    super._set([], nextValue);
  }

  /** Updates the current value using a modifier function. No-op if the value is unchanged (by reference). */
  public modify(modifier: (val: V) => V): void {
    this.coalescer.fire({ type: 'modify', modifier });
  }

  /** Replaces the current value. No-op if the value is unchanged (by reference). */
  public set(val: V): void {
    this.coalescer.fire({ type: 'set', val });
  }

  /** Returns the current value without creating a subscription. */
  public peek(): V {
    return this.currentValue;
  }

  result = this;

  release(): MaybePromise<void> {
    return super._decay();
  }
}
