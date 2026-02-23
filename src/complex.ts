import {
  use,
  useCast,
  useConcatenated,
  useConnection,
  useEffect,
  useEnsemble,
  usePortal,
} from '@/blueprint';
import { Field } from '@/field';
import { MaybePromise } from '@/util';
import { Ensemble } from './field/ensemble';

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

export function useMemoize<T>(sourceField: Field<T>): Field<T> {
  const grouped = useGroupBy(sourceField, v => v).map(({ key }) => key);
  return grouped;
}
