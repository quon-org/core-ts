import {
  use,
  useAtom,
  useCast,
  useConcatenated,
  useConnection,
  useEffect,
  useEnsemble,
  usePortal,
} from './blueprint';
import { Field } from './field';
import { MaybePromise } from './util';
import { Ensemble } from './field/ensemble';

/**
 * Groups values from a source Field by a key function.
 * Returns a Field of `{ key, group }` pairs where each group is a Field of values sharing the same key.
 * Groups are created and destroyed dynamically as values arrive and leave.
 * @param sourceField The source Field to group.
 * @param keyFn A function that extracts a grouping key from each value.
 */
export function useGroupBy<V, K>(
  sourceField: Field<V>,
  keyFn: (val: V) => K
): Field<{ key: K; group: Field<V> }> {
  // group の中身を持っておく
  const groupsRef = useEffect(addFinalizeFn => {
    const groups = new Map<
      K,
      {
        portal: Ensemble<V>; // 値を突っ込む
        count: number; // グループに属する値の数
        vanish: () => MaybePromise<void>; // 値を消すときに呼んでください
      }
    >();
    addFinalizeFn(() => {
      const vanishTasks = [...groups.values()].map(group => group.vanish());
      groups.clear();
      if (vanishTasks.some(task => task instanceof Promise)) {
        return Promise.all(vanishTasks).then(() => undefined);
      }
      return;
    });
    return groups;
  });
  const outerEnsemble = useEnsemble<{ key: K; group: Field<V> }>();
  useCast(() => {
    const source = use(sourceField); // sourceField を監視
    const key = keyFn(source); // キーを計算

    const groupState = groupsRef.get(key);

    const newGroupState = useEffect(() => {
      if (!groupState) {
        const p = new Ensemble<V>();
        const outerVal = { key, group: p };
        outerEnsemble.add(outerVal);
        const newGroupState = {
          portal: p,
          count: 0,
          vanish: async (): Promise<void> => {
            await p.vanish();
            return outerEnsemble.remove(outerVal);
          },
        };
        groupsRef.set(key, newGroupState);
        return newGroupState;
      } else {
        return groupState;
      }
    });

    useEffect(addFinalizeFn => {
      newGroupState.portal.add(source);
      newGroupState.count++;
      addFinalizeFn(async () => {
        await newGroupState.portal.remove(source);
        newGroupState.count--;
        if (newGroupState.count === 0) {
          groupsRef.delete(key);
          await newGroupState.vanish();
        }
      });
    });
  });
  return outerEnsemble;
}

/**
 * Decomposes a Field of arrays into individually-tracked keyed elements.
 * Returns a Field of `{ key, value: Field<V> }` pairs and a Field of key orderings.
 * @param sourceField A Field emitting arrays of values.
 * @param keyFn A function that extracts a unique key from each value.
 */
export function useArray<K, V>(
  sourceField: Field<Array<V>>,
  keyFn: (v: V) => K
): [Field<{ key: K; value: Field<V> }>, Field<Array<K>>] {
  const allElemPortal = usePortal<V>(); // 全ての要素を流す Portal
  useCast(() => {
    const source = use(sourceField);
    useConcatenated(
      source.map(elem => (): void => useConnection(allElemPortal, elem))
    );
  });
  // すべての要素をグループ化
  const grouped = useGroupBy(allElemPortal, keyFn).map(({ key, group }) => ({
    key,
    value: group,
  }));
  const keys = sourceField.map(arr => arr.map(keyFn));
  return [grouped, keys];
}

/**
 * Deduplicates values from a source Field by identity.
 * Only emits when a new unique value appears.
 */
export function useMemoize<T>(sourceField: Field<T>): Field<T> {
  const grouped = useGroupBy(sourceField, v => v).map(({ key }) => key);
  return grouped;
}

/**
 * Tracks the latest value from a source Field.
 * Returns a Field that always emits the most recently seen value.
 * @param sourceField The source Field to track.
 * @param unit The default value when no values have been emitted yet.
 */
export function useLatest<T>(sourceField: Field<T>, unit: T): Field<T> {
  const memoized = useMemoize(sourceField);
  const values = useAtom<T[]>([]);
  useCast(() => {
    const source = use(memoized);
    useEffect(addFinalizeFn => {
      values.modify(prev => [...prev, source]);
      addFinalizeFn(() => {
        values.modify(prev => prev.filter(v => v !== source));
      });
    });
  });
  return values.map(arr => arr[arr.length - 1] ?? unit);
}
