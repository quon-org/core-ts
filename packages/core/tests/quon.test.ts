import { describe, it, expect } from 'vitest';
import { LogCapture } from './test-utils';
import {
  toField,
  useAtom,
  useEffect,
  useCast,
  use,
  useTimeout,
  usePortal,
  useConnection,
  createContext,
} from '../src';
import { Atom } from '../src/field/atom';
import { useEnsemble } from '../src/blueprint';
import { useArray, useGroupBy, useMemoize } from '../src/complex';

const useLog = (logs: LogCapture, label: string, releaseLabel?: string): void =>
  useEffect(addRelease => {
    logs.log(`${label}`);
    if (releaseLabel) {
      addRelease(async () => {
        logs.log(`${releaseLabel}`);
      });
    }
  });

describe('Blueprint basic functionality', () => {
  it('should create a pure blueprint and collect its value', async () => {
    const logs = new LogCapture();

    const blueprint = (): void => {
      const value = 42;
      useLog(logs, `value: ${value}`);
    };

    const app = toField(blueprint).asMatter().materialize();
    await new Promise(resolve => setTimeout(resolve, 10));

    const result = logs.expect(['value: 42']);
    expect(result.passed, result.message).toBe(true);

    await app.vanish();
  });

  describe('Blueprint useAtom functionality', () => {
    it('should create an atom and update values', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const atom = useAtom<number>(0);

        useCast(() => {
          const value = use(atom);
          useLog(logs, `value: ${value}`, `released: ${value}`);
        });

        useTimeout(20);
        useEffect(() => atom.set(5));

        useTimeout(20);
        useEffect(() => atom.set(10));
      };

      const app = toField(blueprint).asMatter().materialize();

      // 初期値
      await new Promise(resolve => setTimeout(resolve, 10));
      let result = logs.expect(['value: 0']);
      expect(result.passed, result.message).toBe(true);

      // 最初の更新
      await new Promise(resolve => setTimeout(resolve, 20));
      result = logs.expect(['value: 0', 'value: 5', 'released: 0']);
      expect(result.passed, result.message).toBe(true);

      // 2回目の更新
      await new Promise(resolve => setTimeout(resolve, 20));
      result = logs.expect([
        'value: 0',
        'value: 5',
        'released: 0',
        'value: 10',
        'released: 5',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });

    it('should skip duplicate values', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const atom = useAtom<number>(1);

        useCast(() => {
          useLog(logs, `value: ${use(atom)}`);
        });

        useTimeout(10);
        useEffect(() => atom.set(2));
        useTimeout(10);

        useTimeout(10);
        useEffect(() => atom.set(3));
      };

      const app = toField(blueprint).asMatter().materialize();
      await new Promise(resolve => setTimeout(resolve, 60));

      const result = logs.expect(['value: 1', 'value: 2', 'value: 3']);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });

    it('should handle function updates', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const atom = useAtom<number>(0);

        useCast(() => {
          useLog(logs, `count: ${use(atom)}`);
        });

        useTimeout(10);
        useEffect(() => atom.modify(prev => prev + 1));

        useTimeout(10);
        useEffect(() => atom.modify(prev => prev * 2));
      };

      const app = toField(blueprint).asMatter().materialize();
      await new Promise(resolve => setTimeout(resolve, 40));

      const result = logs.expect(['count: 0', 'count: 1', 'count: 2']);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });

    it('should handle multiple observers independently', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const atom = useAtom<number>(0);

        useCast(() => {
          const value = use(atom);
          useLog(logs, `observer1: ${value}`, `release1: ${value}`);
        });

        useCast(() => {
          const value = use(atom);
          useLog(logs, `observer2: ${value}`, `release2: ${value}`);
        });

        useTimeout(10);
        useEffect(() => atom.set(1));

        useTimeout(10);
        useEffect(() => atom.set(2));
      };

      const app = toField(blueprint).asMatter().materialize();
      await new Promise(resolve => setTimeout(resolve, 40));

      const result = logs.expect([
        'observer1: 0',
        'observer2: 0',
        'observer1: 1',
        'observer2: 1',
        'release1: 0',
        'release2: 0',
        'observer1: 2',
        'observer2: 2',
        'release1: 1',
        'release2: 1',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });
  });

  describe('Blueprint usePortal functionality', () => {
    it('should create a portal and update values', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const portal = usePortal<readonly [symbol, number]>();

        const refetchAtom = useAtom<number>(0);

        useCast(() => {
          const portalValue = use(portal);
          const [, value] = portalValue;
          useLog(logs, `created: ${value}`, `released: ${value}`);
        });

        useCast(() => {
          const refetch = use(refetchAtom);
          useConnection(portal, [Symbol('Portal'), refetch] as const);
        });

        useCast(() => {
          const refetch = use(refetchAtom);
          useTimeout(10);
          useConnection(portal, [Symbol('Portal'), refetch + 100] as const);
        });

        useTimeout(20);
        useEffect(() => refetchAtom.set(5));

        useTimeout(20);
        useEffect(() => refetchAtom.set(10));
      };

      const app = toField(blueprint).asMatter().materialize();

      // Wait for all operations to complete
      await new Promise(resolve => setTimeout(resolve, 60));

      // Atom is synchronous, so updates happen immediately:
      // When refetchAtom.set(5), first cast sees 5 immediately and creates portal value
      // Then old values (0) are released
      // Then second cast (with timeout) completes and creates portal value (105)
      // Then old value (100) is released
      const result = logs.expect([
        'created: 0',
        'created: 100',
        'created: 5',
        'released: 0',
        'released: 100',
        'created: 105',
        'created: 10',
        'released: 5',
        'released: 105',
        'created: 110',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });
  });

  describe('Blueprint cancellation functionality', () => {
    it('should be cancellable while executing', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const cell1 = useAtom<number>(0);
        const cell2 = useAtom<number>(100);

        useCast(() => {
          useLog(logs, `value1: ${use(cell1)}`);
          useTimeout(20);
          useLog(logs, `value2: ${use(cell2)}`);
        });

        useTimeout(50);
        // -> "value1: 0", "value2: 100"
        useEffect(() => cell1.set(1));
        useTimeout(10);
        useEffect(() => cell1.set(2));
        useTimeout(30);
        // cancel before "value2: 100" is logged
        // -> "value1: 1", "value1: 2", "value2: 100"
        useEffect(() => cell2.set(200));
        useTimeout(15);
        // Resume from `use(cell2)` (no value1 logs)
        // -> "value2: 200"
      };

      const app = toField(blueprint).asMatter().materialize();

      // 2回目の更新
      await new Promise(resolve => setTimeout(resolve, 120));
      const result = logs.expect([
        'value1: 0',
        'value2: 100',
        'value1: 1',
        'value1: 2',
        'value2: 100',
        'value2: 200',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });
  });

  describe('Blueprint context functionality', () => {
    it('should use context properly', async () => {
      const logs = new LogCapture();

      const counterCtx = createContext<Atom<number>>();

      const blueprint = (): void => {
        const cell = useAtom<number>(0);
        counterCtx.useProvider(cell);

        useCast(() => {
          const value = use(cell);
          useLog(logs, `count: ${value}`);
        });

        useCast(() => {
          const counter = counterCtx.useConsumer();
          useTimeout(20);
          useEffect(() => counter.set(1));
          useTimeout(20);
          useEffect(() => counter.set(2));
        });

        useTimeout(60);
      };

      const app = toField(blueprint).asMatter().materialize();

      await new Promise(resolve => setTimeout(resolve, 100));
      const result = logs.expect(['count: 0', 'count: 1', 'count: 2']);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });
  });

  describe('Matter resource management', () => {
    it('should be safe to call vanish() multiple times', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        useLog(logs, 'created');
      };

      const app = toField(blueprint).asMatter().materialize();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Call vanish multiple times - should be idempotent
      await app.vanish();
      await app.vanish();
      await app.vanish();

      const result = logs.expect(['created']);
      expect(result.passed, result.message).toBe(true);
    });
  });

  describe('Field groupBy functionality', () => {
    it('should create and remove groups by key, and route values only to matched group', async () => {
      const logs = new LogCapture();

      const blueprint = (): void => {
        const source = useEnsemble<number>();
        const grouped = useGroupBy(source, v => (v % 2 === 0 ? 'even' : 'odd'));

        useCast(() => {
          const { key, group } = use(grouped);
          useLog(logs, `group+: ${key}`, `group-: ${key}`);
          const v = use(group);
          useLog(logs, `${key}: ${v}`);
        });

        useEffect(() => source.add(1));
        useEffect(() => source.add(3));
        useEffect(() => source.add(2));

        useTimeout(10);
        useEffect(() => source.remove(1));
        useEffect(() => source.remove(3));

        useTimeout(10);
        useEffect(() => source.add(5));

        useTimeout(10);
        useEffect(() => source.remove(2));
        useEffect(() => source.remove(5));
      };

      const app = toField(blueprint).asMatter().materialize();
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = logs.expect([
        'group+: odd',
        'odd: 1',
        'odd: 3',
        'group+: even',
        'even: 2',
        'group-: odd',
        'group+: odd',
        'odd: 5',
        'group-: even',
        'group-: odd',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.vanish();
    });
  });

  describe('useArray works correctly', () => {
    it('should create and remove array items by key, and update values', async () => {
    const logs = new LogCapture();

    const blueprint = (): void => {
      const source = useAtom<
        {
          id: string;
          value: number;
        }[]
      >([]);
      const [dataField, orderField] = useArray(source, v => v.id);

      useCast(() => {
        const data = use(dataField);
        useLog(logs, `key+: ${data.key}`, `key-: ${data.key}`);
        const memoizedValue = useMemoize(data.value.map(v => v.value));
        const value = use(memoizedValue);
        useLog(logs, `value: ${data.key}: ${value}`);
      });

      useCast(() => {
        const order = use(orderField);
        useLog(logs, `order: ${order.join(',')}`);
      });

      useTimeout(10);

      useEffect(() => {
        source.set([
          { id: 'a', value: 1 },
          { id: 'b', value: 2 },
          { id: 'c', value: 3 },
        ]);
      });

      useTimeout(10);

      useEffect(() => {
        source.set([
          { id: 'a', value: 1 },
          { id: 'b', value: 2 },
        ]);
      });

      useTimeout(10);

      useEffect(() => {
        source.set([
          { id: 'b', value: 2 },
          { id: 'c', value: 3 },
        ]);
      });

      useTimeout(10);

      useEffect(() => {
        source.set([
          { id: 'b', value: 100 },
          { id: 'c', value: 3 },
        ]);
      });
    };

    const app = toField(blueprint).asMatter().materialize();
    await new Promise(resolve => setTimeout(resolve, 50));

    const result = logs.expect([
      'order: ',
      'key+: a',
      'value: a: 1',
      'key+: b',
      'value: b: 2',
      'key+: c',
      'value: c: 3',
      'order: a,b,c',
      'order: a,b',
      'key-: c',
      'key+: c',
      'value: c: 3',
      'order: b,c',
      'key-: a',
      'value: b: 100',
      'order: b,c',
    ]);
    expect(result.passed, result.message).toBe(true);

    await app.vanish();
    });
  });
});
