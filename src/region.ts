import * as Rs from '@/resource';

export type Region<V> = (
  listener: (val: V) => Rs.Resource<void>
) => Rs.Resource<void>;

export function map<V, U>(rs: Region<V>, fn: (val: V) => U): Region<U> {
  return (listener: (val: U) => Rs.Resource<void>): Rs.Resource<void> => {
    return rs(val => listener(fn(val)));
  };
}

export function filter<V, S extends V>(
  rs: Region<V>,
  fn: (val: V) => val is S
): Region<S>;

export function filter<V>(rs: Region<V>, fn: (val: V) => boolean): Region<V>;

export function filter<V>(rs: Region<V>, fn: (val: V) => boolean): Region<V> {
  return (listener: (val: V) => Rs.Resource<void>): Rs.Resource<void> => {
    return rs(val => {
      if (fn(val)) {
        return listener(val);
      }
      return Rs.resolve(undefined);
    });
  };
}

export function then<V, U>(
  rs: Region<V>,
  fn: (val: V) => Region<U>
): Region<U> {
  return (listener: (val: U) => Rs.Resource<void>): Rs.Resource<void> => {
    return rs(val => {
      return fn(val)(listener);
    });
  };
}

export function combine<V, U>(sc1: Region<V>, sc2: Region<U>): Region<[V, U]> {
  return then(sc1, v => map(sc2, u => [v, u] as const));
}

export function fromResource<V>(r: Rs.Resource<V>): Region<V> {
  return (listener: (val: V) => Rs.Resource<void>): Rs.Resource<void> => {
    return Rs.then(r, listener);
  };
}

export function of<V>(val: V): Region<V> {
  return (listener: (val: V) => Rs.Resource<void>): Rs.Resource<void> => {
    return listener(val);
  };
}
