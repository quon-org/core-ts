import { BiLinkMap } from '@/bilink-map';
import { Field } from '@/field';
import { Effect, Matter, Presence } from '@/matter';
import { MaybePromise } from '@/util';

export class Atom<V> extends Field<V> implements Presence<Atom<V>> {
  private biLinks = new BiLinkMap<null, (val: V) => Matter<void>>();
  private currentValue: V;

  constructor(initValue: V) {
    super();
    this.currentValue = initValue;

    // Register the initial ID so future subRgribers find it
    this.biLinks.linkAllA(null, listener => {
      return listener(initValue);
    });
  }

  public couple(listener: (val: V) => Matter<void>): Matter<void> {
    return new Effect(addFinalizeFn => {
      // Connect to the current entry
      this.biLinks.linkAllB(listener, () => {
        return listener(this.currentValue);
      });

      addFinalizeFn(() => {
        return this.biLinks.unlinkAllB(listener);
      });
    });
  }

  public modify(modifier: (val: V) => V): void {
    const newValue = modifier(this.currentValue);

    if (newValue === this.currentValue) {
      return;
    }

    // Unlink old ID triggers finalize for routines connected to old value
    this.biLinks.unlinkAllA(null);

    // Update state
    this.currentValue = newValue;

    // Link new ID triggers init for routines connected to new value
    this.biLinks.linkAllA(null, listener => {
      return listener(newValue);
    });
  }

  public set(val: V): void {
    this.modify(() => val);
  }

  public peek(): V {
    return this.currentValue;
  }

  public result: MaybePromise<Atom<V>> = this;
  public vanish = (): MaybePromise<void> => {
    return this.biLinks.unlinkAll();
  };
}
