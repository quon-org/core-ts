import {
  useConnection,
  useInteraction,
  useCluster,
  useBridge,
  useCasts,
} from './diagram';
import { Field } from './field';
import { Structural } from './structual';
import { Dimension, DimensionScalar } from './trie';

/**
 * Groups values from a source Field by a key function.
 * Returns a Field of `{ key, group }` pairs where each group is a Field of values sharing the same key.
 * Groups are created and destroyed dynamically as values arrive and leave.
 * @param sourceField The source Field to group.
 * @param keyFn A function that extracts a grouping key from each value.
 */
export function useGroupBy<P extends Dimension, V, K extends DimensionScalar>(
  sourceField: Field<P, V>,
  keyFn: (val: V, coodinate: readonly [...P]) => K
): Field<[K], Field<P, V>> {
  // それぞれの key に対して、対応する Field を作成する関数
  const createGroupField = (key: K): Field<P, V> =>
    sourceField.filter((val, coodinate) => keyFn(val, coodinate) === key);

  // 現在保持している key 一覧 Cluster
  const keysField = useCluster<[K], number>();

  // sourceField の値の変化に応じて keysField を更新
  useCasts(sourceField, (source, coord) => {
    useInteraction(addFinalizeFn => {
      const key = keyFn(source, coord);
      keysField.modify([key], prevValue => {
        if (prevValue === undefined) {
          return 1;
        } else {
          return prevValue + 1;
        }
      });
      addFinalizeFn(() => {
        keysField.modify([key], prevValue => {
          if (prevValue === undefined) {
            console.warn(
              `Key ${String(key)} was expected to exist in keysField`
            );
            return undefined;
          } else if (prevValue === 1) {
            return undefined;
          } else {
            return prevValue - 1;
          }
        });
      });
    });
  });

  // keysField の key 一覧をもとに、グループ化された Field を作成
  const groupedField = keysField.map((_, [key]) => createGroupField(key));
  return groupedField;
}

/**
 * Decomposes a Field of arrays into individually-tracked keyed elements.
 * Returns a Field of `{ key, value: Field<V> }` pairs and a Field of key orderings.
 * @param sourceField A Field emitting arrays of values.
 * @param keyFn A function that extracts a unique key from each value.
 */
export function useArray<
  const P extends Dimension,
  K extends DimensionScalar,
  V,
>(
  sourceField: Field<P, Array<V>>,
  keyFn: (v: V) => K
): [Field<[K], Field<readonly [...P, number], V>>, Field<P, Array<K>>] {
  const allElemBridge = useBridge<readonly [...P, number], V>(); // 全ての要素を流す Bridge
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
export function useCoalescing<
  P extends Dimension,
  T extends DimensionScalar & Structural,
>(sourceField: Field<P, T>): Field<readonly [T], T> {
  const grouped = useGroupBy(sourceField, val => val);
  return grouped.map((_, [val]) => val);
}
