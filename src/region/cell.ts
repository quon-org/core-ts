import { BiLinkMap } from '@/bilink-map';
import * as Rg from '@/region';
import * as Rs from '@/resource';

export type Cell<V> = Rg.Region<V> & {
  items(): readonly V[];
  modify(modifier: (val: V) => V): void;
  set(val: V): void;
  peek(): V;
};

export function make<V>(initValue: V): Rs.Resource<Cell<V>> {
  return Rs.effect(addFinalizeFn => {
    const biLinks = new BiLinkMap<null, (val: V) => Rs.Resource<void>>();
    let currentValue = initValue;

    // Register the initial ID so future subRgribers find it
    biLinks.linkAllA(null, listener => {
      return listener(initValue);
    });

    function state(listener: (val: V) => Rs.Resource<void>): Rs.Resource<void> {
      return Rs.effect(addFinalizeFn => {
        // Connect to the current entry
        biLinks.linkAllB(listener, () => {
          return listener(currentValue);
        });

        addFinalizeFn(() => {
          return biLinks.unlinkAllB(listener);
        });
      });
    }

    state.modify = function (fn: (val: V) => V): void {
      const newValue = fn(currentValue);

      if (newValue === currentValue) {
        return;
      }

      // Unlink old ID triggers finalize for routines connected to old value
      biLinks.unlinkAllA(null);

      // Update state
      currentValue = newValue;

      // Link new ID triggers init for routines connected to new value
      biLinks.linkAllA(null, listener => {
        return listener(newValue);
      });
    };

    state.set = function (newValue: V): void {
      state.modify(() => newValue);
    };

    state.peek = function (): V {
      return currentValue;
    };

    state.items = function (): readonly V[] {
      return [currentValue];
    };

    addFinalizeFn(async () => {
      await biLinks.unlinkAll();
    });

    return state;
  });
}
