import {
  useConnection,
  useDerivation,
  useEffect,
  usePortal,
} from './blueprint';

export function useDistribution<K, V>(
  source: SingletonStore<Array<V>>,
  getKey: (v: V) => K
): Store<K, SingletonStore<V>> {
  const portal = usePortal<K, Atom<V>>();
  useDerivation(source, vs => {
    for (const v of vs) {
      const key = getKey(v);
      const atom = useEffect(() => portal.peek(key));
      if (!atom) {
        const atom = useEffect(() => {
          return new Atom(v);
        });
        useEffect(() => {
          portal.set(key, atom);
        });
      } else {
        useEffect(() => {
          atom.set(v);
        });
      }
    }
    const currentKeys = new Set<K>(vs.map(getKey));
    const prevKeys = portal.keys();
    for (const prevKey of prevKeys) {
      if (!currentKeys.has(prevKey)) {
        useEffect(async () => {
          await portal.peek(prevKey)?.finalize();
          await portal.remove(prevKey);
        });
      }
    }
  });
  return portal;
}
