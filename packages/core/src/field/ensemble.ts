import { BiLinkMap } from '@/bilink-map';
import { Field } from '@/field';
import { Effect, Matter, Presence } from '@/matter';
import { MaybePromise } from '@/util';

export class Ensemble<V> extends Field<V> implements Presence<Ensemble<V>> {
  private biLinks = new BiLinkMap<V, (val: V) => Matter<void>>();

  constructor() {
    super();
  }

  couple(listener: (val: V) => Matter<void>): Matter<void> {
    return new Effect(addFinalizeFn => {
      // Connect to all existing entries
      this.biLinks.linkAllB(listener, val => {
        return listener(val);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  add(val: V): void {
    this.biLinks.linkAllA(val, listener => {
      return listener(val);
    });
  }

  async remove(val: V): Promise<void> {
    await this.biLinks.unlinkAllA(val);
  }

  items(): readonly V[] {
    return Array.from(this.biLinks.getAs());
  }

  result: MaybePromise<Ensemble<V>> = this;
  vanish = (): MaybePromise<void> => {
    return this.biLinks.unlinkAll();
  };
}
