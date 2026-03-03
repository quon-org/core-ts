import {
  useConnection,
  useInteraction,
  useCluster,
  useBridge,
  useCasts,
} from './diagram';
import { Field } from './field';
import { MaybePromise } from './util';
import { Cluster } from './field/cluster';

/**
 * Groups values from a source Field by a key function.
 * Returns a Field of `{ key, group }` pairs where each group is a Field of values sharing the same key.
 * Groups are created and destroyed dynamically as values arrive and leave.
 * @param sourceField The source Field to group.
 * @param keyFn A function that extracts a grouping key from each value.
 */
export function useGroupBy<P extends unknown[], V, K>(
  sourceField: Field<P, V>,
  keyFn: (val: V, coodinate: readonly [...P]) => K
): Field<[K], Field<P, V>> {
  // group の中身を持っておく
  const groupsRef = useInteraction(addFinalizeFn => {
    const groups = new Map<
      K,
      {
        bridge: Cluster<P, V>; // 値を突っ込む
        count: number; // グループに属する値の数
        decay: () => MaybePromise<void>; // 値を消すときに呼んでください
      }
    >();
    addFinalizeFn(() => {
      const decayTasks = [...groups.values()].map(group => group.decay());
      groups.clear();
      if (decayTasks.some(task => task instanceof Promise)) {
        return Promise.all(decayTasks).then(() => undefined);
      }
      return;
    });
    return groups;
  });
  const outerCluster = useCluster<[K], Field<P, V>>();
  useCasts(sourceField, (source, coord) => {
    const key = keyFn(source, coord); // キーを計算

    const groupState = groupsRef.get(key);

    const newGroupState = useInteraction(() => {
      if (!groupState) {
        const p = new Cluster<P, V>();
        outerCluster.set([key], p);
        const newGroupState = {
          bridge: p,
          count: 0,
          decay: async (): Promise<void> => {
            await p.decay();
            return outerCluster.delete([key]);
          },
        };
        groupsRef.set(key, newGroupState);
        return newGroupState;
      } else {
        return groupState;
      }
    });

    useInteraction(addFinalizeFn => {
      newGroupState.bridge.set(coord, source);
      newGroupState.count++;
      console.log(
        `Added value to group ${key}, count is now ${newGroupState.count}`
      );
      addFinalizeFn(() => {
        const deleteResult = newGroupState.bridge.delete(coord);
        newGroupState.count--;
        console.log(
          `Removed value from group ${key}, count is now ${newGroupState.count}`
        );
        setTimeout(async () => {
          // ちょっと待つ
          // (カウントが 0 個になったあと同期的に値が追加された場合、グループを消さないようにするため)
          console.log(
            `Checking if group ${key} should be deleted, count: ${newGroupState.count}`
          );
          if (newGroupState.count === 0) {
            groupsRef.delete(key);
            await newGroupState.decay();
          }
        }, 0);
        return deleteResult;
      });
    });
  });
  return outerCluster;
}

/**
 * Decomposes a Field of arrays into individually-tracked keyed elements.
 * Returns a Field of `{ key, value: Field<V> }` pairs and a Field of key orderings.
 * @param sourceField A Field emitting arrays of values.
 * @param keyFn A function that extracts a unique key from each value.
 */
export function useArray<const P extends readonly unknown[], K, V>(
  sourceField: Field<P, Array<V>>,
  keyFn: (v: V) => K
): [Field<[K], Field<[...P, number], V>>, Field<P, Array<K>>] {
  const allElemBridge = useBridge<[...P, number], V>(); // 全ての要素を流す Bridge
  useCasts(sourceField, (source, coord) => {
    source.forEach((elem, idx): void =>
      useConnection(allElemBridge, [...coord, idx], elem)
    );
  });
  // すべての要素をグループ化
  const grouped = useGroupBy(allElemBridge, keyFn);
  const keys = sourceField.map(arr => arr.map(keyFn));
  return [grouped, keys];
}

/**
 * Deduplicates values from a source Field by identity.
 * Only emits when a new unique value appears.
 */
export function useMemoize<P extends unknown[], T>(
  sourceField: Field<P, T>
): Field<[T], T> {
  const grouped = useGroupBy(sourceField, v => v).map((_, [coord]) => coord);
  return grouped;
}
