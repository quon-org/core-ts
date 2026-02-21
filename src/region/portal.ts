import { BiLinkMap } from '@/bilink-map';
import * as Rg from '@/region';
import * as Rs from '@/resource';

export type Portal<V> = Rg.Region<V> & {
  items(): readonly V[];
  connect(val: V): Rs.Resource<void>;
};

export function make<V>(): Rs.Resource<Portal<V>> {
  return Rs.effect(addFinalizeFn => {
    const biLinks = new BiLinkMap<number, (val: V) => Rs.Resource<void>>();
    const keyToValue = new Map<number, V>();
    let nextKey = 0;

    function collection(
      listener: (val: V) => Rs.Resource<void>
    ): Rs.Resource<void> {
      return Rs.effect(addFinalizeFn => {
        const key = nextKey++;

        // Connect to all existing entries
        biLinks.linkAllB(listener, () => {
          return listener(keyToValue.get(key)!);
        });

        addFinalizeFn(() => {
          return biLinks.unlinkAllB(listener);
        });
      });
    }
    collection.connect = function (val: V): Rs.Resource<void> {
      return Rs.effect(addFinalizeFn => {
        const key = nextKey++;
        keyToValue.set(key, val);
        biLinks.linkAllA(key, listener => {
          return listener(val);
        });
        addFinalizeFn(() => {
          keyToValue.delete(key);
          return biLinks.unlinkAllA(key);
        });
      });
    };
    collection.items = function (): readonly V[] {
      return Array.from(keyToValue.values());
    };

    addFinalizeFn(async () => {
      keyToValue.clear();
      await biLinks.unlinkAll();
    });

    return collection;
  });
}

export function cast<V>(source: Rg.Region<V>): Rs.Resource<Rg.Region<V>> {
  return Rs.then(make<V>(), collection =>
    Rs.map(
      source(val => collection.connect(val)),
      () => collection
    )
  );
}
