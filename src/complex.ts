// export function useArray<K, V>(
//   sourceRg: Field<Array<V>>,
//   getKey: (v: V) => K
// ): [Field<{ key: K; value: Field<V> }>, Field<Array<K>>] {
//   const portal = usePortal<{ key: K; value: Portal<V> }>();
//   useCast(() => {
//     const vs = use(sourceRg);
//     for (const v of vs) {
//       const key = getKey(v);
//       const valuePortal = useEffect(
//         () => portal.items().find(item => item.key === key)?.value
//       );
//       if (!valuePortal) {
//         const valuePortal = useEffect(() => new Portal<V>());
//         useEffect(() => {
//           portal.set(key, valuePortal);
//         });
//       } else {
//         useEffect(() => {
//           valuePortal.set(v);
//         });
//       }
//     }
//     const currentKeys = new Set<K>(vs.map(getKey));
//     const prevKeys = portal.keys();
//     for (const prevKey of prevKeys) {
//       if (!currentKeys.has(prevKey)) {
//         useEffect(async () => {
//           await portal.peek(prevKey)?.finalize();
//           await portal.remove(prevKey);
//         });
//       }
//     }
//   });
//   return portal;
// }
