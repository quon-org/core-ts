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
import { SplitAt } from './util';

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

  /**
   * Create a structural copy of this Trie.
   *
   * - Internal Map/Leaf nodes are copied recursively.
   * - Stored values `V` are copied shallowly (references are preserved).
   */
  copy(): Trie<P, V> {
    const copied = new Trie<P, V>();

    const copyNode = (node: TrieNode): TrieNode => {
      const next: TrieNode = new Map();
      for (const [key, child] of node) {
        if (child instanceof Map) {
          next.set(key, copyNode(child));
        } else {
          next.set(key, new Leaf(child.value));
        }
      }
      return next;
    };

    copied.root = copyNode(this.root);
    return copied;
  }

  /**
   * Returns a new Trie that contains entries under the given prefix coordinate.
   *
   * The returned Trie uses the suffix coordinates (the part after `prefix`).
   *
   * @example
   * ```ts
   * const trie = new Trie<[string, number, boolean], string>();
   * trie.set(['a', 1, true], 'x');
   * trie.set(['a', 2, false], 'y');
   *
   * const sub = trie.subtrie(['a']);
   * sub.get([1, true]); // 'x'
   * sub.get([2, false]); // 'y'
   * ```
   *
   * Notes:
   * - If `prefix` does not exist, an empty Trie is returned.
   * - If `prefix` points exactly to a leaf value, an empty Trie is returned
   *   (zero-dimension leaf tries are not represented in this implementation).
   */
  subtrie<
    const Prefix extends Dimension,
    const Suffix extends Dimension = SplitAt<P, Prefix['length']>[1],
  >(prefix: readonly [...Prefix]): Trie<Suffix, V> {
    const copied = new Trie<Suffix, V>();

    let node: TrieNode = this.root;
    for (let i = 0; i < prefix.length; i++) {
      const child = node.get(prefix[i]);
      if (!(child instanceof Map)) {
        return copied;
      }
      node = child;
    }

    const copyNode = (src: TrieNode): TrieNode => {
      const dest: TrieNode = new Map();
      for (const [key, child] of src) {
        if (child instanceof Map) {
          dest.set(key, copyNode(child));
        } else {
          dest.set(key, new Leaf(child.value));
        }
      }
      return dest;
    };

    copied.root = copyNode(node);
    return copied;
  }

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

  /**
   * Enumerates existing prefixes whose depth is exactly `depth`.
   *
   * - Depth starts at 1 for the first coordinate element.
   * - Returns only prefixes that actually exist in the trie.
   * - Does not include the empty prefix ([]).
   *
   * @example
   * ```ts
   * const trie = new Trie<[string, number, boolean], string>();
   * trie.set(['a', 1, true], 'x');
   * trie.set(['a', 2, false], 'y');
   * trie.set(['b', 3, true], 'z');
   *
   * [...trie.prefixes(1)] // => [['a'], ['b']]
   * [...trie.prefixes(2)] // => [['a', 1], ['a', 2], ['b', 3]]
   * ```
   */
  *prefixes<const N extends number>(
    depth: N
  ): IterableIterator<SplitAt<P, N>[0]> {
    if (depth <= 0) {
      return;
    }

    const path: DimensionScalar[] = [];

    function* walk(
      node: TrieNode,
      currentDepth: number
    ): IterableIterator<SplitAt<P, N>[0]> {
      if (currentDepth >= depth) return;

      for (const [key, child] of node) {
        path.push(key);
        const nextDepth = currentDepth + 1;

        if (nextDepth === depth) {
          yield [...path] as unknown as SplitAt<P, N>[0];
        } else if (child instanceof Map) {
          yield* walk(child, nextDepth);
        }

        path.pop();
      }
    }

    yield* walk(this.root, 0);
  }
}
