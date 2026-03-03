import { Coalescer } from '../coalescer';
import { Field } from '../field';
import { Excitation, Interaction, Operator } from '../operator';
import { Trie } from '../trie';
import { MaybePromise } from '../util';

type ExcitationState<V> =
  // 励起中
  | { excitation: Excitation<void> }
  // 減衰中 (nextVal がある場合は、減衰完了後に即座に励起しなおす)
  // overwritable が true の場合は、nextVal の上書きが可能。
  | { decaying: Promise<void>; nextVal?: V; overwritable: true }
  // overwritable が false の場合は、nextVal の上書きが不可能。これは主に、coupling の解除や、BaseField 自体の decay 時の状態である。
  | { decaying: Promise<void>; overwritable: false };

export class BaseField<P extends readonly unknown[], V> extends Field<P, V> {
  // それぞれのcoupleに対して、Coodinate 毎の State を保持している。
  private excitations: Map<symbol, Trie<P, ExcitationState<V>>> = new Map();

  // 現在設定されてる値の map
  protected currentValues: Trie<P, V> = new Trie();

  // この Set に関数を置いておくと、値が set / unset された際に通知される。
  private mutationListeners = new Set<
    (event: { coodinate: readonly [...P]; nextVal?: V }) => MaybePromise<void>
  >();

  public couple(
    listener: (val: V, coodinate: readonly [...P]) => Operator<void>
  ): Operator<void> {
    const excitations = this.excitations;
    return new Interaction(addFinalizeFn => {
      const id = Symbol();
      const trie = new Trie<P, ExcitationState<V>>();
      excitations.set(id, trie);

      addFinalizeFn(() => {
        excitations.delete(id);
      });

      // mutationListeners に登録して、値の変更を監視。
      const mutationListener = (event: {
        coodinate: readonly [...P];
        nextVal?: V;
      }): MaybePromise<void> => {
        // coodinate に対応する State を trie から取り出す。
        const state = trie.get(event.coodinate);
        if (!state && 'nextVal' in event) {
          // State が存在せず、かつ nextVal がある場合は、新たに励起する。
          const excitation = listener(
            event.nextVal!,
            event.coodinate
          ).exicite();
          trie.set(event.coodinate, { excitation });
          return;
        }
        if (!state && !('nextVal' in event)) {
          // state が存在せず、かつ nextVal もない場合は、何もしない。
          return;
        }
        if (state && 'excitation' in state) {
          // state が存在し、励起中である場合は減衰させる。減衰完了時に、もし nextVal があれば励起しなおす。(減衰開始時の nextVal は今後変更される可能性がある点に注意。)
          const decaying = state.excitation.decay();
          if (decaying instanceof Promise) {
            // 非同期 decay
            const state: ExcitationState<V> = { decaying, overwritable: true };
            if ('nextVal' in event) {
              state.nextVal = event.nextVal;
            }
            trie.set(event.coodinate, state);
            // decaying を返却することで、set / unset はこれを待てる
            return decaying.then(() => {
              // decay 完了時の処理
              const currentState = trie.get(event.coodinate);
              if (!currentState) {
                // 起こりえない
                throw new Error('State should exist during decay completion.');
              }
              if (
                !('decaying' in currentState) ||
                currentState.decaying !== decaying
              ) {
                // 起こりえない
                throw new Error(
                  'State should be in decaying state with the same decaying promise during decay completion.'
                );
              }
              if ('nextVal' in currentState!) {
                // nextVal がある場合は励起しなおす。
                const excitation = listener(
                  currentState.nextVal!,
                  event.coodinate
                ).exicite();
                trie.set(event.coodinate, { excitation });
              } else {
                // 無い場合は State を削除する。
                trie.delete(event.coodinate);
              }
            });
          } else {
            // 同期 decay
            if ('nextVal' in event) {
              // event.nextVal がある場合は即座に励起しなおす
              const excitation = listener(
                event.nextVal!,
                event.coodinate
              ).exicite();
              trie.set(event.coodinate, { excitation });
            } else {
              // event.nextVal がない場合は State を削除する
              trie.delete(event.coodinate);
            }
          }
          return;
        }
        if (state && 'decaying' in state) {
          // state が存在し、減衰中である場合は、nextVal の上書きを試みる。
          if (!state.overwritable) {
            // 上書き不可の場合は何もしない。
            return state.decaying;
          } else {
            // 上書き可能かつ event.nextVal がある場合は nextVal を上書きする。ない場合は逆に削除する
            if ('nextVal' in event) {
              trie.set(event.coodinate, {
                decaying: state.decaying,
                nextVal: event.nextVal,
                overwritable: true,
              });
            } else {
              trie.set(event.coodinate, {
                decaying: state.decaying,
                overwritable: true,
              });
            }
            return state.decaying;
          }
        }
      };

      // mutationListener を登録する。
      this.mutationListeners.add(mutationListener);

      // finalize 時に mutationListener を削除する。
      addFinalizeFn(() => {
        this.mutationListeners.delete(mutationListener);
      });

      // すべての現在の値について、励起する。
      const currentValues = this.currentValues.entries();
      for (const [coodinate, val] of currentValues) {
        const excitation = listener(val, coodinate).exicite();
        trie.set(coodinate, { excitation });
      }

      // coupling 終了時に、現在励起中のものを全て減衰させる。
      addFinalizeFn(async () => {
        const excitations = trie.entries();
        const decayings: Promise<void>[] = [];
        for (const [coodinate, state] of excitations) {
          if ('excitation' in state) {
            // 励起中のものは減衰させる。
            const decaying = state.excitation.decay();
            if (decaying instanceof Promise) {
              trie.set(coodinate, { decaying, overwritable: false });
              // decaying の最後に trie から State を削除しないと、State に残ったままであるが、そもそも Trie 自体を削除してしまうので問題ない。
              decayings.push(decaying);
            } else {
              // 同期 decay の場合は即座に State を削除する。
              trie.delete(coodinate);
            }
          } else if ('decaying' in state) {
            // すでに減衰中のものは、overwritable を false にする。decayings に積む。
            trie.set(coodinate, {
              decaying: state.decaying,
              overwritable: false,
            });
            decayings.push(state.decaying);
          }
        }
        if (decayings.length > 0) {
          // decayings がある場合は全ての decay が完了するのを待ってから finalize を完了する。
          await Promise.all(decayings).then(() => undefined);
        }
      });
    });
  }

  public coodinates(): Field<[...P], null> {
    const mutationListeners = this.mutationListeners;
    const InnerClassRef = class InnerClass
      extends BaseField<[...P], null>
      implements Excitation<InnerClass>
    {
      // 親 Field の mutationListeners を Proxy
      private coalescer = new Coalescer<{
        coodinate: readonly [...P];
        type: 'set' | 'delete';
      }>();

      private mutationListener = (event: {
        coodinate: readonly [...P];
        nextVal?: V;
      }): MaybePromise<void> => {
        if ('nextVal' in event) {
          this.coalescer.fire({ coodinate: event.coodinate, type: 'set' });
        } else {
          this.coalescer.fire({ coodinate: event.coodinate, type: 'delete' });
        }
        return;
      };
      // coalescer に対して購読
      private coalescerListener = (
        events: {
          coodinate: readonly [...P];
          type: 'set' | 'delete';
        }[]
      ): void => {
        // それぞれの coodinate について、最後のイベントを取る
        const lastEventMap = new Map<readonly [...P], 'set' | 'delete'>();
        for (const event of events) {
          lastEventMap.set(event.coodinate, event.type);
        }
        // currentValuus を見に存在せず、set されているものについては _set する。
        // 逆もしかり
        for (const [coodinate, type] of lastEventMap.entries()) {
          const exists = this.currentValues.has(coodinate);
          if (!exists && type === 'set') {
            super._set(coodinate, null);
          } else if (exists && type === 'delete') {
            super._unset(coodinate);
          }
        }
      };

      constructor() {
        super();
        mutationListeners.add(this.mutationListener);
        this.coalescer.subscribe(this.coalescerListener);
      }

      result = this;

      decay(): MaybePromise<void> {
        mutationListeners.delete(this.mutationListener);
        this.coalescer.unsubscribe(this.coalescerListener);
        return super._decay();
      }
    };
    return Field.ofOperator(Operator.ofClass(InnerClassRef)).flatMap(
      inner => inner
    );
  }

  protected _set(coodinate: readonly [...P], val: V): MaybePromise<void> {
    const mutationPromises: Promise<void>[] = [];
    this.currentValues.set(coodinate, val);
    // 値を set するたびに mutationListeners に通知する。
    for (const listener of this.mutationListeners) {
      const mutationResult = listener({ coodinate, nextVal: val });
      if (mutationResult instanceof Promise) {
        mutationPromises.push(mutationResult);
      }
    }
    if (mutationPromises.length > 0) {
      return Promise.all(mutationPromises).then(() => undefined);
    }
    return;
  }

  protected _unset(coodinate: readonly [...P]): MaybePromise<void> {
    const mutationPromises: Promise<void>[] = [];
    this.currentValues.delete(coodinate);
    // 値を unset するたびに mutationListeners に通知する。
    for (const listener of this.mutationListeners) {
      const mutationResult = listener({ coodinate });
      if (mutationResult instanceof Promise) {
        mutationPromises.push(mutationResult);
      }
    }
    if (mutationPromises.length > 0) {
      return Promise.all(mutationPromises).then(() => undefined);
    }
    return;
  }

  protected _decay(): MaybePromise<void> {
    // すべての coupling のすべての state について、
    // 1. 励起中なら減衰させる。 (overwritable は false)
    // 2. 減衰中なら overwritable を false にする。
    // 3. すべての decaying が完了するのを待つ。
    const decayings: Promise<void>[] = [];
    for (const trie of this.excitations.values()) {
      const excitations = trie.entries();
      for (const [coodinate, state] of excitations) {
        if ('excitation' in state) {
          // 励起中のものは減衰させる。
          const decaying = state.excitation.decay();
          if (decaying instanceof Promise) {
            trie.set(coodinate, { decaying, overwritable: false });
            // decaying の最後に trie から State を削除しないと、State に残ったままであるが、そもそも Trie 自体を削除してしまうので問題ない。
            decayings.push(decaying);
          } else {
            // 同期 decay の場合は即座に State を削除する。
            trie.delete(coodinate);
          }
        } else if ('decaying' in state) {
          // すでに減衰中のものは、overwritable を false にする。decayings に積む。
          trie.set(coodinate, {
            decaying: state.decaying,
            overwritable: false,
          });
          decayings.push(state.decaying);
        }
      }
    }
    if (decayings.length > 0) {
      // decayings がある場合は全ての decay が完了するのを待ってから finalize を完了する。
      return Promise.all(decayings).then(() => undefined);
    }
    return;
  }
}
