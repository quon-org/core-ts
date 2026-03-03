import { Coalescer } from '../coalescer';
import { Excitation } from '../operator';
import { Structural } from '../structual';
import { Dimension, Trie } from '../trie';
import { MaybePromise } from '../util';
import { BaseField } from './base';

type ClusterMutationEvent<P extends Dimension, V> =
  | {
      type: 'set';
      coodinate: P;
      val: V;
    }
  | {
      type: 'delete';
      coodinate: P;
    }
  | {
      type: 'modify';
      coodinate: P;
      modifier: (val: V | undefined) => V | undefined;
    }
  | {
      type: 'deleteIf';
      predicate: (val: V, coodinate: P) => boolean;
    };

/**
 * A dynamic set-based reactive state container.
 * Values can be added and removed by identity.
 */
export class Cluster<P extends Dimension, V extends Structural>
  extends BaseField<P, V>
  implements Excitation<Cluster<P, V>>
{
  private currentFilledCoordinates = new Trie<P, V>();
  // 同期的なイベントの連鎖をまとめる
  private coalescer = new Coalescer<ClusterMutationEvent<P, V>>();

  constructor() {
    super();
    this.coalescer.subscribe(evs => this.processCoalescer(evs));
  }

  /** Returns a snapshot of all currently connected values. */
  public items(): readonly V[] {
    return Array.from(this.currentFilledCoordinates.values());
  }

  public processCoalescer(evs: ClusterMutationEvent<P, V>[]): void {
    console.log(`Processing ${evs.length} events in Cluster coalescer`);
    // イベントを順番に処理して、coordinate 毎の最終状態を計算する
    // deleteIf は全 coordinate に影響するため、coordinate 別の集計ではなく順次処理が必要
    const snapshot = new Trie<P, V | undefined>();

    // 初期値: 現在の値をコピー
    for (const [coodinate, val] of this.currentFilledCoordinates.entries()) {
      snapshot.set(coodinate, val);
    }

    for (const ev of evs) {
      if (ev.type === 'set') {
        snapshot.set(ev.coodinate, ev.val);
      } else if (ev.type === 'delete') {
        snapshot.set(ev.coodinate, undefined);
      } else if (ev.type === 'modify') {
        const current = snapshot.get(ev.coodinate);
        snapshot.set(ev.coodinate, ev.modifier(current));
      } else if (ev.type === 'deleteIf') {
        for (const [coodinate, val] of snapshot.entries()) {
          if (val !== undefined && ev.predicate(val, coodinate)) {
            snapshot.set(coodinate, undefined);
          }
        }
      }
    }

    // 差分を適用
    for (const [coodinate, nextVal] of snapshot.entries()) {
      const currentVal = this.currentFilledCoordinates.get(coodinate);
      if (nextVal === currentVal) {
        continue;
      }
      if (nextVal !== undefined) {
        this.currentFilledCoordinates.set(coodinate, nextVal);
        super._set(coodinate, nextVal);
      } else {
        this.currentFilledCoordinates.delete(coodinate);
        super._unset(coodinate);
      }
    }
  }

  /** Adds a value to the set, notifying all coupled listeners. */
  public set(coodinate: P, val: V): void {
    console.log(`Added coordinate ${coodinate} to cluster with value ${val}`);
    this.coalescer.fire({ type: 'set', coodinate, val });
  }

  /** Removes a value from the set, cleaning up associated listeners. */
  public delete(coodinate: P): void {
    console.log(`Deleted coordinate ${coodinate} from cluster`);
    this.coalescer.fire({ type: 'delete', coodinate });
  }

  public modify(
    coodinate: P,
    modifier: (val: V | undefined) => V | undefined
  ): MaybePromise<void> {
    this.coalescer.fire({ type: 'modify', coodinate, modifier });
  }

  /** Removes all values that satisfy the predicate. */
  public deleteIf(predicate: (val: V, coodinate: P) => boolean): void {
    this.coalescer.fire({ type: 'deleteIf', predicate });
  }

  result = this;

  decay(): MaybePromise<void> {
    return super._decay();
  }
}
