export type DimensionScalar =
  | string
  | number
  | symbol
  | null
  | undefined
  | boolean;

export type Dimension = readonly DimensionScalar[];

export type ZeroDimension = readonly [];

/** Wrapper to distinguish stored values from child Maps */
class Leaf<V> {
  constructor(public value: V) {}
}

type TrieNode = Map<DimensionScalar, TrieNode | Leaf<unknown>>;

/**
 * A type-safe Trie indexed by a tuple path P with values of type V.
 * Internally represented as nested Maps. Leaf values are wrapped in
 * a Leaf object to distinguish them from child nodes.
 *
 * IMPORTANT: coordinate must have exactly P['length'] elements.
 * Passing longer arrays will produce incorrect results.
 *
 * @example
 * ```ts
 * const trie = new Trie<[string, number, boolean], string>();
 * trie.set(["a", 0, true], "hello");
 * trie.get(["a", 0, true]); // "hello"
 * trie.get(["a", 0, false]); // undefined
 * trie.delete(["a", 0, true]); // true
 * ```
 */
export class Trie<P extends Dimension, V> {
  private root: TrieNode = new Map();

  get(coordinate: P): V | undefined {
    let node: TrieNode = this.root;
    for (let i = 0; i < coordinate.length - 1; i++) {
      const child = node.get(coordinate[i]);
      if (!(child instanceof Map)) return undefined;
      node = child;
    }
    const leaf = node.get(coordinate[coordinate.length - 1]);
    if (leaf instanceof Leaf) return leaf.value as V;
    return undefined;
  }

  set(coordinate: P, value: V): void {
    let node: TrieNode = this.root;
    for (let i = 0; i < coordinate.length - 1; i++) {
      let child = node.get(coordinate[i]);
      if (!(child instanceof Map)) {
        child = new Map();
        node.set(coordinate[i], child);
      }
      node = child;
    }
    node.set(coordinate[coordinate.length - 1], new Leaf(value));
  }

  delete(coordinate: P): boolean {
    const stack: { map: TrieNode; key: DimensionScalar }[] = [];
    let node: TrieNode = this.root;

    for (let i = 0; i < coordinate.length - 1; i++) {
      stack.push({ map: node, key: coordinate[i] });
      const child = node.get(coordinate[i]);
      if (!(child instanceof Map)) return false;
      node = child;
    }

    const lastKey = coordinate[coordinate.length - 1];
    if (!(node.get(lastKey) instanceof Leaf)) return false;
    node.delete(lastKey);

    // Prune empty Maps bottom-up
    if (node.size === 0) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const { map, key } = stack[i]!;
        const child = map.get(key) as TrieNode;
        if (child.size === 0) {
          map.delete(key);
        } else {
          break;
        }
      }
    }

    return true;
  }

  has(coordinate: P): boolean {
    return this.get(coordinate) !== undefined;
  }

  *entries(): IterableIterator<[P, V]> {
    const path: unknown[] = [];
    function* walk(node: TrieNode): IterableIterator<[P, V]> {
      for (const [key, child] of node) {
        if (child instanceof Leaf) {
          path.push(key);
          yield [[...path] as unknown as P, child.value as V];
          path.pop();
        } else {
          path.push(key);
          yield* walk(child);
          path.pop();
        }
      }
    }
    yield* walk(this.root);
  }

  *values(): IterableIterator<V> {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  *keys(): IterableIterator<P> {
    for (const [key] of this.entries()) {
      yield key;
    }
  }
}
