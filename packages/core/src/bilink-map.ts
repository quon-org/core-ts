import * as Rs from './resource';
import { MaybePromise } from './util';

export class BiLinkMap<A, B> {
  private aToB = new Map<A, Map<B, () => MaybePromise<void>>>();
  private bToA = new Map<B, Map<A, () => MaybePromise<void>>>();

  addAB(a: A, b: B, finalize: () => MaybePromise<void>): void {
    // トップレベルの a / b を追加するのは linkAll の役割
    if (!this.aToB.has(a)) {
      console.warn('BiLinkMap: a not found');
      return;
    }
    if (!this.bToA.has(b)) {
      console.warn('BiLinkMap: b not found');
      return;
    }
    this.aToB.get(a)!.set(b, finalize);
    this.bToA.get(b)!.set(a, finalize);
  }

  removeAB(a: A, b: B): void {
    this.aToB.get(a)?.delete(b);
    this.bToA.get(b)?.delete(a);
    // トップレベルの a / b を掃除するのは unlinkAll の役割
  }

  private finalizing = new Map<A, Map<B, Set<Promise<void>>>>();

  addFinalizingAB(a: A, b: B, promise: Promise<void>): void {
    if (!this.finalizing.has(a)) {
      this.finalizing.set(a, new Map());
    }
    if (!this.finalizing.get(a)?.has(b)) {
      this.finalizing.get(a)!.set(b, new Set());
    }
    this.finalizing.get(a)!.get(b)!.add(promise);
  }

  removeFinalizingAB(a: A, b: B, promise: Promise<void>): void {
    this.finalizing.get(a)?.get(b)?.delete(promise);
    if (this.finalizing.get(a)?.get(b)?.size === 0) {
      this.finalizing.get(a)?.delete(b);
    }
    if (this.finalizing.get(a)?.size === 0) {
      this.finalizing.delete(a);
    }
  }

  getA(b: B): Iterable<A> {
    return this.bToA.get(b)?.keys() ?? [];
  }

  getB(a: A): Iterable<B> {
    return this.aToB.get(a)?.keys() ?? [];
  }

  getAs(): Iterable<A> {
    return this.aToB.keys();
  }

  getBs(): Iterable<B> {
    return this.bToA.keys();
  }

  link(a: A, b: B, component: Rs.Resource<void>): void {
    const { result, release: decay } = component.aquire();
    if (result instanceof Promise) {
      result.catch(() => {}); // result が投げたエラーを適宜握りつぶす
    }
    this.addAB(a, b, decay);
  }

  /** Unlink A and B */
  unlink(a: A, b: B): MaybePromise<void> {
    const finalize = this.aToB.get(a)?.get(b);
    if (!finalize) return;
    const maybePromise = finalize();
    this.removeAB(a, b);
    if (maybePromise instanceof Promise) {
      const finalizingPromise = maybePromise.then(() => {
        this.removeFinalizingAB(a, b, finalizingPromise);
      });
      this.addFinalizingAB(a, b, finalizingPromise);
      return Promise.all([
        ...(this.finalizing.get(a)?.get(b)?.values() ?? []),
      ]).then(() => {});
    }
    return;
  }

  /** Link A to all B */
  linkAllA(a: A, component: (b: B) => Rs.Resource<void>): void {
    if (this.aToB.has(a)) {
      return;
    }
    this.aToB.set(a, new Map());
    const bs = this.bToA.keys();
    [...bs].map(b => this.link(a, b, component(b)));
  }

  /** Link B to all A */
  linkAllB(b: B, component: (a: A) => Rs.Resource<void>): void {
    if (this.bToA.has(b)) {
      return;
    }
    this.bToA.set(b, new Map());
    const as = this.aToB.keys();
    [...as].map(a => this.link(a, b, component(a)));
  }

  /** Unlink all links associated with A */
  async unlinkAllA(a: A): Promise<void> {
    const bs = this.bToA.keys();
    const promises = [...bs].map(b => this.unlink(a, b));
    this.aToB.delete(a);
    if (promises.some(p => p instanceof Promise)) {
      return Promise.all(promises).then(() => {});
    }
  }

  /** Unlink all links associated with B */
  async unlinkAllB(b: B): Promise<void> {
    const as = this.aToB.keys();
    const promises = [...as].map(a => this.unlink(a, b));
    this.bToA.delete(b);
    if (promises.some(p => p instanceof Promise)) {
      return Promise.all(promises).then(() => {});
    }
  }

  /** Unlink and clear all links */
  unlinkAll(): MaybePromise<void> {
    const as = this.aToB.keys();
    const promises = [...as].map(a => this.unlinkAllA(a));
    this.aToB.clear();
    this.bToA.clear();
    if (promises.some(p => p instanceof Promise)) {
      return Promise.all(promises).then(() => {});
    }
    return;
  }
}
