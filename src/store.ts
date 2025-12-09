import { BiLinkMap } from './bilink-map';
import { Routine, Effect } from './routine';
import { MaybePromise } from './util';

export abstract class Store<V> {
  public abstract subscribe(listener: (val: V) => Routine<void>): Routine<void>;

  public collect(sortBy: (val: V) => Store<V>) {
    return {} as any;
  }

  public map<U>(fn: (val: V) => U): Store<U> {
    return new BasicStore(
      listener =>
        this.subscribe(val => {
          return listener(fn(val));
        }),
      () => this.peek().map(fn)
    );
  }

  public filter(fn: (val: V) => boolean): Store<V> {
    return new BasicStore(
      listener =>
        this.subscribe(val => {
          if (fn(val)) {
            return listener(val);
          }
          return Routine.resolve(undefined);
        }),
      () => this.peek().filter(fn)
    );
  }

  public flatMap<U>(fn: (val: V) => Store<U>): Store<U> {
    return new BasicStore<U>(listener =>
      this.subscribe(val => {
        return fn(val).subscribe(v => listener(v));
      })
    );
  }

  public combine<U>(other: Store<U>): Store<[V, U]> {
    return new BasicStore<[V, U]>(listener =>
      this.subscribe(v => {
        return other.subscribe(u => listener([v, u]));
      })
    );
  }

  public derive = <U>(fn: (val: V) => Routine<U>): Routine<Store<U>> => {
    return new Effect(addFinalizeFn => {
      const portal = new Portal<U>();
      addFinalizeFn(() => portal.finalize());
      return portal;
    }).then(portal =>
      this.subscribe(val => fn(val).then(u => portal.connect(null, u))).map(
        () => portal
      )
    );
  };

  public static of<V>(value: V): Store<V> {
    return new BasicStore(listener => listener(value));
  }
}

class BasicStore<V> extends Store<V> {
  constructor(
    private subscribeFn: (listener: (val: V) => Routine<void>) => Routine<void>
  ) {
    super();
  }

  public subscribe(listener: (val: V) => Routine<void>): Routine<void> {
    return this.subscribeFn(listener);
  }
}

export class Portal<K, V> extends Store<K, V> {
  private biLinks: BiLinkMap<K, (val: V, key: K) => Routine<void>>;
  private keyToValue = new Map<K, V>();

  constructor() {
    super();
    this.biLinks = new BiLinkMap();
  }

  public finalize(): MaybePromise<void> {
    return this.biLinks.unlinkAll();
  }

  public subscribe(listener: (val: V, key: K) => Routine<void>): Routine<void> {
    return new Effect(addFinalizeFn => {
      // Connect to all existing entries
      this.biLinks.linkAllB(listener, key => {
        return listener(this.keyToValue.get(key)!, key);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  public peek(key: K): V | undefined {
    return this.keyToValue.get(key);
  }

  public has(key: K): boolean {
    return this.keyToValue.has(key);
  }

  public keys(): Iterable<K> {
    return this.keyToValue.keys();
  }

  public set(key: K, value: V): void {
    const oldValue = this.keyToValue.get(key);
    if (oldValue === value) {
      return;
    }

    if (this.keyToValue.has(key)) {
      this.remove(key);
    }

    this.keyToValue.set(key, value);
    this.biLinks.linkAllA(key, listener => {
      return listener(value, key);
    });
  }

  public modify(key: K, modifyFn: (value: V) => V): MaybePromise<void> {
    const oldValue = this.keyToValue.get(key);
    if (!oldValue) {
      return;
    }
    const newValue = modifyFn(oldValue);
    this.set(key, newValue);
    return;
  }

  public remove(key: K): MaybePromise<void> {
    this.keyToValue.delete(key);
    return this.biLinks.unlinkAllA(key);
  }

  public connect(key: K, value: V): Routine<void> {
    return new Effect(addFinalizeFn => {
      this.set(key, value);
      addFinalizeFn(() => this.remove(key));
    });
  }

  public static factoryRoutine<K, V>(): Routine<Portal<K, V>> {
    return new Effect(addFinalizeFn => {
      const portal = new Portal<K, V>();
      addFinalizeFn(() => portal.finalize());
      return portal;
    });
  }
}

export class Atom<V> extends Store<null, V> {
  private biLinks: BiLinkMap<null, (val: V, key: null) => Routine<void>>;
  private currentValue: V;

  constructor(initValue: V) {
    super();
    this.biLinks = new BiLinkMap();
    this.currentValue = initValue;

    // Register the initial ID so future subscribers find it
    this.biLinks.linkAllA(null, listener => {
      return listener(initValue, null);
    });
  }

  public finalize(): MaybePromise<void> {
    return this.biLinks.unlinkAll();
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

    if (newValue === this.currentValue) {
      return;
    }

    // Unlink old ID triggers finalize for routines connected to old value
    this.biLinks.unlinkAllA(null);

    // Update state
    this.currentValue = newValue;

    // Link new ID triggers init for routines connected to new value
    this.biLinks.linkAllA(null, listener => {
      return listener(newValue, null);
    });
  }

  public set(newValue: V): void {
    this.modify(() => newValue);
  }

  public peek(): V {
    return this.currentValue;
  }

  public has(): true {
    return true;
  }

  public keys(): Iterable<null> {
    return [null];
  }

  public static factoryRoutine<V>(initValue: V): Routine<Atom<V>> {
    return new Effect(addFinalizeFn => {
      const atom = new Atom(initValue);
      addFinalizeFn(() => atom.finalize());
      return atom;
    });
  }
}
