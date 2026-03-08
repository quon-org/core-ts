import { describe, it, expect } from 'vitest';
import { LogCapture } from './test-utils';
import {
  toField,
  useAtom,
  useInteraction,
  useCast,
  use,
  useTimeout,
  useBridge,
  useConnection,
  createContext,
} from '../src';
import { Atom } from '../src/field/atom';
import { useCasts, useCluster, useId } from '../src/diagram';
import { useArray, useGroupBy, useCoalescing } from '../src/complex';

const useLog = (logs: LogCapture, label: string, releaseLabel?: string): void =>
  useInteraction(addRelease => {
    logs.log(`${label}`);
    if (releaseLabel) {
      addRelease(async () => {
        logs.log(`${releaseLabel}`);
      });
    }
  });

describe('Diagram basic functionality', () => {
  it('should create a pure diagram and collect its value', async () => {
    const logs = new LogCapture();

    const diagram = (): void => {
      const value = 42;
      useLog(logs, `value: ${value}`);
    };

    const app = toField(diagram).asOperator().aquire();
    await new Promise(resolve => setTimeout(resolve, 10));

    const result = logs.expect(['value: 42']);
    expect(result.passed, result.message).toBe(true);

    await app.release();
  });

  describe('Diagram useAtom functionality', () => {
    it('should create an atom and update values', async () => {
      const logs = new LogCapture();

      const diagram = (): void => {
        const atom = useAtom<number>(0);

        useCast(() => {
          const value = use(atom);
          useLog(logs, `value: ${value}`, `released: ${value}`);
        });

        useTimeout(20);
        useInteraction(() => atom.set(5));

        useTimeout(20);
        useInteraction(() => atom.set(10));
      };

      const app = toField(diagram).asOperator().aquire();

      // 初期値
      await new Promise(resolve => setTimeout(resolve, 10));
      let result = logs.expect(['value: 0']);
      expect(result.passed, result.message).toBe(true);

      // 最初の更新
      await new Promise(resolve => setTimeout(resolve, 20));
      result = logs.expect(['value: 0', 'released: 0', 'value: 5']);
      expect(result.passed, result.message).toBe(true);

      // 2回目の更新
      await new Promise(resolve => setTimeout(resolve, 80));
      result = logs.expect([
        'value: 0',
        'released: 0',
        'value: 5',
        'released: 5',
        'value: 10',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.release();
    });

    it('should skip duplicate values', async () => {
      const logs = new LogCapture();

      const diagram = (): void => {
        const atom = useAtom<number>(1);

        useCast(() => {
          useLog(logs, `value: ${use(atom)}`);
        });

        useTimeout(10);
        useInteraction(() => atom.set(2));
        useTimeout(10);

        useTimeout(10);
        useInteraction(() => atom.set(3));
      };

      const app = toField(diagram).asOperator().aquire();
      await new Promise(resolve => setTimeout(resolve, 60));

      const result = logs.expect(['value: 1', 'value: 2', 'value: 3']);
      expect(result.passed, result.message).toBe(true);

      await app.release();
    });

    it('should handle function updates', async () => {
      const logs = new LogCapture();

      const diagram = (): void => {
        const atom = useAtom<number>(0);

        useCast(() => {
          useLog(logs, `count: ${use(atom)}`);
        });

        useTimeout(10);
        useInteraction(() => atom.modify(prev => prev + 1));

        useTimeout(10);
        useInteraction(() => atom.modify(prev => prev * 2));
      };

      const app = toField(diagram).asOperator().aquire();
      await new Promise(resolve => setTimeout(resolve, 40));

      const result = logs.expect(['count: 0', 'count: 1', 'count: 2']);
      expect(result.passed, result.message).toBe(true);

      await app.release();
    });

    it('should handle multiple observers independently', async () => {
      const logs = new LogCapture();

      const diagram = (): void => {
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
        useInteraction(() => atom.set(1));

        useTimeout(10);
        useInteraction(() => atom.set(2));
      };

      const app = toField(diagram).asOperator().aquire();
      await new Promise(resolve => setTimeout(resolve, 40));

      const result = logs.expect([
        'observer1: 0',
        'observer2: 0',
        'release1: 0',
        'release2: 0',
        'observer1: 1',
        'observer2: 1',
        'release1: 1',
        'release2: 1',
        'observer1: 2',
        'observer2: 2',
      ]);
      expect(result.passed, result.message).toBe(true);

      await app.release();
    });
  });

  describe('Diagram useBridge functionality', () => {
    it('should create a bridge and update values', async () => {
      const logs = new LogCapture();
      const diagram = (): void => {
        const bridge = useBridge<readonly [symbol], number>();
        const refetchAtom = useAtom<number>(0);
        useCasts(bridge, bridgeValue => {
          useLog(logs, `created: ${bridgeValue}`, `released: ${bridgeValue}`);
        });
        const id1 = useId('id1');
        const id2 = useId('id2');
        useCast(() => {
          const refetch = use(refetchAtom);
          useConnection(bridge, [id1], refetch);
        });
        useCast(() => {
          const refetch = use(refetchAtom);
          useTimeout(10);
          useConnection(bridge, [id2], refetch + 100);
        });
        useTimeout(20);
        useInteraction(() => refetchAtom.set(5));
        useTimeout(20);
        useInteraction(() => refetchAtom.set(10));
      };
      const app = toField(diagram).asOperator().aquire();
      // Wait for all operations to complete
      await new Promise(resolve => setTimeout(resolve, 60));
      // Atom is synchronous, so updates happen immediately:
      // When refetchAtom.set(5), first cast sees 5 immediately and creates bridge value
      // Then old values (0) are released
      // Then second cast (with timeout) completes and creates bridge value (105)
      // Then old value (100) is released
      const result = logs.expect([
        'created: 0',
        'created: 100',
        'released: 0',
        'released: 100',
        'created: 5',
        'created: 105',
        'released: 5',
        'released: 105',
        'created: 10',
        'created: 110',
      ]);
      expect(result.passed, result.message).toBe(true);
      await app.release();
    });
  });
  describe('Diagram cancellation functionality', () => {
    it('should be cancellable while executing', async () => {
      const logs = new LogCapture();
      const diagram = (): void => {
        const cell1 = useAtom<number>(0);
        const cell2 = useAtom<number>(100);
        useCast(() => {
          useLog(logs, `value1: ${use(cell1)}`);
          useTimeout(20);
          useLog(logs, `value2: ${use(cell2)}`);
        });
        useTimeout(50);
        // -> "value1: 0", "value2: 100"
        useInteraction(() => cell1.set(1));
        useTimeout(10);
        useInteraction(() => cell1.set(2));
        useTimeout(30);
        // cancel before "value2: 100" is logged
        // -> "value1: 1", "value1: 2", "value2: 100"
        useInteraction(() => cell2.set(200));
        useTimeout(15);
        // Resume from `use(cell2)` (no value1 logs)
        // -> "value2: 200"
      };
      const app = toField(diagram).asOperator().aquire();
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
      await app.release();
    });
  });
  describe('Diagram context functionality', () => {
    it('should use context properly', async () => {
      const logs = new LogCapture();
      const counterCtx = createContext<Atom<number>>();
      const diagram = (): void => {
        const cell = useAtom<number>(0);
        counterCtx.useProvider(cell);
        useCast(() => {
          const value = use(cell);
          useLog(logs, `count: ${value}`);
        });
        useCast(() => {
          const counter = counterCtx.useConsumer();
          useTimeout(20);
          useInteraction(() => counter.set(1));
          useTimeout(20);
          useInteraction(() => counter.set(2));
        });
        useTimeout(60);
      };
      const app = toField(diagram).asOperator().aquire();
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = logs.expect(['count: 0', 'count: 1', 'count: 2']);
      expect(result.passed, result.message).toBe(true);
      await app.release();
    });
  });
  describe('Operator resource management', () => {
    it('should be safe to call decay() multiple times', async () => {
      const logs = new LogCapture();
      const diagram = (): void => {
        useLog(logs, 'created');
      };
      const app = toField(diagram).asOperator().aquire();
      await new Promise(resolve => setTimeout(resolve, 10));
      // Call decay multiple times - should be idempotent
      await app.release();
      await app.release();
      await app.release();
      const result = logs.expect(['created']);
      expect(result.passed, result.message).toBe(true);
    });
  });
  describe('Field groupBy functionality', () => {
    it('should create and remove groups by key, and route values only to matched group', async () => {
      const logs = new LogCapture();
      const diagram = (): void => {
        const source = useCluster<[number], null>();
        const grouped = useGroupBy(
          source,
          (_, [v]) => [v % 2 === 0 ? 'even' : 'odd'] as const
        );
        useCasts(grouped, (group, key) => {
          useLog(logs, `group+: ${key}`, `group-: ${key}`);
          useCasts(group, (_, [v]) => {
            useLog(logs, `${key}: ${v}`);
          });
        });
        useInteraction(() => source.set([1], null));
        useInteraction(() => source.set([3], null));
        useInteraction(() => source.set([2], null));
        useTimeout(10);
        useInteraction(() => source.delete([1]));
        useInteraction(() => source.delete([3]));
        useTimeout(10);
        useInteraction(() => source.set([5], null));
        useTimeout(10);
        useInteraction(() => source.delete([2]));
        useInteraction(() => source.delete([5]));
      };
      const app = toField(diagram).asOperator().aquire();
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
      await app.release();
    });
    describe('useArray works correctly', () => {
      it('should create and remove array items by key, and update values', async () => {
        const logs = new LogCapture();
        const diagram = (): void => {
          const source = useAtom<
            {
              id: string;
              value: number;
            }[]
          >([
            { id: 'a', value: 1 },
            { id: 'b', value: 2 },
            { id: 'c', value: 3 },
          ]);
          const [dataField, orderField] = useArray(source, v => v.id);
          useCasts(dataField, (data, [key]) => {
            useLog(logs, `key+: ${key}`, `key-: ${key}`);
            const memoizedValue = useCoalescing(data.map(v => v.value));
            useCasts(memoizedValue, value => {
              useLog(logs, `value: ${key}: ${value}`);
            });
          });
          useCast(() => {
            const order = use(orderField);
            useLog(logs, `order: ${order.join(',')}`);
          });
          useTimeout(10);
          useInteraction(() => {
            source.set([
              { id: 'a', value: 1 },
              { id: 'b', value: 2 },
            ]);
          });
          useTimeout(10);
          useInteraction(() => {
            source.set([
              { id: 'b', value: 2 },
              { id: 'c', value: 3 },
            ]);
          });
          useTimeout(10);
          useInteraction(() => {
            source.set([
              { id: 'b', value: 100 },
              { id: 'c', value: 3 },
            ]);
          });
        };
        const app = toField(diagram).asOperator().aquire();
        await new Promise(resolve => setTimeout(resolve, 50));
        const result = logs.expect([
          'order: a,b,c',
          'key+: a',
          'key+: b',
          'key+: c',
          'value: a: 1',
          'value: b: 2',
          'value: c: 3',
          'order: a,b',
          'key-: c',
          'order: b,c',
          'key+: c',
          'value: c: 3',
          'key-: a',
          'order: b,c',
          'value: b: 100',
        ]);
        expect(result.passed, result.message).toBe(true);
        await app.release();
      });
    });
  });
});
