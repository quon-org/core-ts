/**
 * A generic event coalescer that batches synchronous events
 * and flushes them together per microtask tick.
 *
 * When `fire()` is called multiple times synchronously,
 * subscribers receive the full sequence of events that occurred during the tick.
 * This allows subscribers to inspect the history (e.g. detect unset→set coalescing)
 * while still deferring processing to after the synchronous burst completes.
 *
 * @example
 * ```ts
 * const c = new Coalescer<string>();
 * c.subscribe(events => {
 *   console.log(events); // ['a', 'b', 'c']
 *   // The last event is events[events.length - 1]
 * });
 * c.fire('a');
 * c.fire('b');
 * c.fire('c');
 * // After microtask: logs ['a', 'b', 'c']
 * ```
 */
export class Coalescer<V> {
  private pending: V[] = [];
  private scheduled = false;
  private listeners = new Set<(events: V[]) => void>();

  /** Enqueue an event. All events fired in one synchronous tick are collected and flushed together. */
  fire(event: V): void {
    this.pending.push(event);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  private flush(): void {
    this.scheduled = false;
    const events = this.pending;
    this.pending = [];
    if (events.length > 0) {
      for (const listener of this.listeners) {
        listener(events);
      }
    }
  }

  /** Register a listener that receives the full sequence of events from one tick. Returns an unsubscribe function. */
  subscribe(fn: (events: V[]) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  unsubscribe(fn: (events: V[]) => void): void {
    this.listeners.delete(fn);
  }
}
