export type MaybePromise<T> = T | Promise<T>;

type BuildTuple<
  N extends number,
  Acc extends readonly unknown[] = readonly [],
> = Acc['length'] extends N ? Acc : BuildTuple<N, readonly [...Acc, unknown]>;

export type Take<
  T extends readonly unknown[],
  N extends number,
  Acc extends readonly unknown[] = readonly [],
> = Acc['length'] extends N
  ? Acc
  : T extends readonly [infer H, ...infer R]
    ? Take<readonly [...R], N, readonly [...Acc, H]>
    : Acc;

export type Drop<
  T extends readonly unknown[],
  N extends number,
> = T extends readonly [...BuildTuple<N>, ...infer Rest]
  ? readonly [...Rest]
  : readonly [];

export type SplitAt<T extends readonly unknown[], N extends number> = readonly [
  Take<T, N>,
  Drop<T, N>,
];
