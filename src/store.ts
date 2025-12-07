import { BiLinkMap } from './bilink-map';
import { Routine, Effect } from './routine';

type EntryId = symbol;

type Entry<V, K> = {
  value: V;
  key: K;
};

export abstract class Store<K, V> {
  public abstract subscribe(
    listener: (val: V, key: K) => Routine<void>
  ): Routine<void>;

  public map<U>(fn: (val: V, key: K) => U): Store<K, U> {
    class MapStore extends Store<K, U> {
      constructor(private parentStore: Store<K, V>) {
        super();
      }

      public subscribe(
        listener: (val: U, key: K) => Routine<void>
      ): Routine<void> {
        return this.parentStore.subscribe((val, key) => {
          return listener(fn(val, key), key);
        });
      }
    }
    return new MapStore(this);
  }

  public filter(fn: (val: V, key: K) => boolean): Store<K, V> {
    class FilterStore extends Store<K, V> {
      constructor(private parentStore: Store<K, V>) {
        super();
      }

      public subscribe(
        listener: (val: V, key: K) => Routine<void>
      ): Routine<void> {
        return this.parentStore.subscribe((val, key) => {
          if (fn(val, key)) {
            return listener(val, key);
          }
          return Routine.resolve(undefined);
        });
      }
    }
    return new FilterStore(this);
  }

  public at(targetKey: K): Store<null, V> {
    class AtStore extends Store<null, V> {
      constructor(private parentStore: Store<K, V>) {
        super();
      }

      public subscribe(
        listener: (val: V, key: null) => Routine<void>
      ): Routine<void> {
        return this.parentStore.subscribe((val, key) => {
          if (targetKey === key) {
            return listener(val, null);
          }
          return Routine.resolve(undefined);
        });
      }
    }
    return new AtStore(this);
  }

  public flatMap<U>(fn: (val: V, key: K) => Store<null, U>): Store<K, U> {
    class FlatMapStore extends Store<K, U> {
      constructor(private parentStore: Store<K, V>) {
        super();
      }

      public subscribe(
        listener: (val: U, key: K) => Routine<void>
      ): Routine<void> {
        return this.parentStore.subscribe((val, key) => {
          return fn(val, key).subscribe(v => listener(v, key));
        });
      }
    }
    return new FlatMapStore(this);
  }

  public combine<U>(other: Store<null, U>): Store<K, [V, U]> {
    class CombineStore extends Store<K, [V, U]> {
      constructor(
        private parentStore: Store<K, V>,
        private otherStore: Store<null, U>
      ) {
        super();
      }

      public subscribe(
        listener: (val: [V, U], key: K) => Routine<void>
      ): Routine<void> {
        return this.parentStore.subscribe((val, key) => {
          return this.otherStore.subscribe(v => listener([val, v], key));
        });
      }
    }
    return new CombineStore(this, other);
  }

  public derive = <U>(
    fn: (val: V, key: K) => Routine<U>
  ): Routine<Store<K, U>> => {
    return new Effect(addFinalizeFn => {
      const portal = new Portal<K, U>();
      addFinalizeFn(() => portal.finalize());
      return portal;
    }).then(portal =>
      this.subscribe((val, key) =>
        fn(val, key).then(u => portal.connect(key, u))
      ).map(() => portal)
    );
  };
}

export abstract class SingletonStore<V> extends Store<null, V> {}

export class Portal<K, V> extends Store<K, V> {
  private biLinks: BiLinkMap<EntryId, (val: V, key: K) => Routine<void>>;
  private entries: Map<EntryId, Entry<V, K>>;
  private keyToId: Map<K, EntryId>;

  constructor() {
    super();
    this.biLinks = new BiLinkMap();
    this.entries = new Map();
    this.keyToId = new Map();
  }

  public finalize(): Promise<void> {
    return Promise.resolve(this.biLinks.unlinkAll()).then(() => {});
  }

  public subscribe(listener: (val: V, key: K) => Routine<void>): Routine<void> {
    return new Effect(addFinalizeFn => {
      // Connect to all existing entries
      this.biLinks.linkAllB(listener, id => {
        const entry = this.entries.get(id);
        if (!entry) {
          // Should not happen if logic is correct
          return Routine.resolve(undefined);
        }
        return listener(entry.value, entry.key);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  public connect(key: K, value: V): Routine<void> {
    return new Effect(addFinalizeFn => {
      const newId: EntryId = Symbol('EntryId');

      // Handle overwrite
      const oldId = this.keyToId.get(key);
      if (oldId !== undefined) {
        // Unlink old ID from listeners (triggers finalize for those routines)
        // We don't await this here, as per requirements
        this.biLinks.unlinkAllA(oldId);
      }

      // Update state
      this.keyToId.set(key, newId);
      this.entries.set(newId, { value, key });

      // Link new ID to all listeners (triggers init)
      this.biLinks.linkAllA(newId, listener => {
        return listener(value, key);
      });

      addFinalizeFn(() => {
        // Cleanup phase
        const currentId = this.keyToId.get(key);

        // If the key still points to this ID, remove it from keyToId
        if (currentId === newId) {
          this.keyToId.delete(key);
        }

        // Always remove from entries
        this.entries.delete(newId);

        // Terminate all routines associated with this value
        return this.biLinks.unlinkAllA(newId);
      });
    });
  }
}

export class Atom<V> extends SingletonStore<V> {
  private biLinks: BiLinkMap<EntryId, (val: V, key: null) => Routine<void>>;
  private currentId: EntryId;
  private currentValue: V;

  constructor(initValue: V) {
    super();
    this.biLinks = new BiLinkMap();
    this.currentId = Symbol('AtomId');
    this.currentValue = initValue;

    // Register the initial ID so future subscribers find it
    this.biLinks.linkAllA(this.currentId, listener => {
      return listener(initValue, null);
    });
  }

  public finalize(): Promise<void> {
    return Promise.resolve(this.biLinks.unlinkAll()).then(() => {});
  }

  public subscribe(
    listener: (val: V, key: null) => Routine<void>
  ): Routine<void> {
    return new Effect(addFinalizeFn => {
      // Connect to the current entry
      this.biLinks.linkAllB(listener, () => {
        return listener(this.currentValue, null);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  public modify(fn: (val: V) => V): void {
    const newValue = fn(this.currentValue);
    const oldId = this.currentId;

    // Unlink old ID triggers finalize for routines connected to old value
    this.biLinks.unlinkAllA(oldId);

    // Update state
    this.currentId = Symbol('AtomId');
    this.currentValue = newValue;

    // Link new ID triggers init for routines connected to new value
    this.biLinks.linkAllA(this.currentId, listener => {
      return listener(newValue, null);
    });
  }

  public set(newValue: V): void {
    this.modify(() => newValue);
  }
}
