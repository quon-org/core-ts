import { Field, Scalar } from './field';
import { Atom } from './field/atom';
import { Cluster } from './field/cluster';
import { Bridge } from './field/bridge';
import { IdOp, Interaction, Operator, Ref, RefOp } from './operator';
import { MaybePromise } from './util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DiagramResult = any;

type UserContext = Record<symbol, DiagramResult>;

type DIAGRAM_GLOBAL_CONTEXT_TYPE = {
  use<V>(rg: Scalar<V>): V;
  getUserCtx(): UserContext;
};

let DIAGRAM_GLOBAL_CONTEXT: DIAGRAM_GLOBAL_CONTEXT_TYPE | undefined = undefined;

export type Context<T> = {
  key: symbol;
  useProvider(value: T): void;
  useConsumer(): T;
};

function getDiagramGlobalContext(): DIAGRAM_GLOBAL_CONTEXT_TYPE {
  const global = DIAGRAM_GLOBAL_CONTEXT;
  if (global === undefined) {
    throw new Error(
      'Diagram context access outside of Diagram execution. ' +
        'Make sure to call this function only within a Diagram (inside toField).'
    );
  }
  return global;
}

function useContextProvider<T>(key: symbol, value: T): void {
  const global = getDiagramGlobalContext();
  useOperator(
    new Interaction<void>(addFinalizeFn => {
      const temp = global.getUserCtx()[key];
      global.getUserCtx()[key] = value;

      addFinalizeFn(() => {
        if (temp === undefined) {
          delete global.getUserCtx()[key];
        } else {
          global.getUserCtx()[key] = temp;
        }
      });
    })
  );
}

function useContextConsumer<T>(key: symbol): T {
  const global = getDiagramGlobalContext();
  const value = global.getUserCtx()[key];
  if (value === undefined) {
    const keyDescription = key.description || '<anonymous>';
    throw new Error(
      `No context value provided for key: ${keyDescription}. ` +
        'Make sure a parent Diagram called useProvider() for this context.'
    );
  }
  // Type assertion is safe here because:
  // 1. The context key is type-branded (created by createContext<T>())
  // 2. The value is set by useProvider() with the correct type
  // 3. The symbol key ensures type consistency at compile time
  return value as T;
}

export function useUserContext(): UserContext {
  const global = getDiagramGlobalContext();
  return { ...global.getUserCtx() };
}

/**
 * Creates a context for dependency injection within Diagrams.
 * Use `useProvider(value)` in a parent Diagram and `useConsumer()` in a child.
 */
export function createContext<T>(): Context<T> {
  return {
    key: Symbol('Quon.Context'),
    useProvider(value: T): void {
      useContextProvider(this.key, value);
    },
    useConsumer(): T {
      return useContextConsumer<T>(this.key);
    },
  };
}

/*
NOTE:
同期処理を使って monadic chain を構築したい (Diagram)

例 :
const c = () => {
  const a = useFoo();
  const b = useBar(a);
  const c = useHoge(b);
  return c;
}

### I. 通常の Diagram
まず、最終的には diagram () => T を Field<T> に変換したい。
Field<T> ~ (listener: (val: T) => Operator<void>) => Operator<void> であるので、
listener が与えられていることを前提として、 Operator<void> を作れば良い。

今、Operator<void> を実行中とする。
たとえば、一度目の useFoo : Field<A> のところまで来た。これと listener: (val : A) => Operator<void> を用意してより大きな Operator<void> を作る。
この listener は、まず、通常の Diagram だと、発火履歴と c の組を、再帰的に実行したものである。(つまり、発火履歴があるところまでは c をそのまま実行し、発火履歴が無いところから先だけを仮想的に実行する)
そして、useFoo に作った listener を渡して自身は throw すれば、useFoo の中で listener が呼び出されるので、そこで c の続きを実行すれば良い。


### II. 同期最適化
ただし、毎回 throw しているとパフォーマンスが悪い。そこで、useFoo が listener を初回に呼び出すとき、それが同期的であったならば、throw せずに c の続きを実行しちゃう方が良い。
つまり、一旦変数 result を用意して、useFoo に listener を渡すとき、 listener を次のようにする
1. 初回、かつ同期の場合は result に値をセットし、続きの処理は実行しない。
2. それ以外の場合は通常の場合と同様。(つまり c の続きを実行する)
そして、useFoo を呼び出したあと、result に値が入っていればそれを返し、そうでなければ throw すれば良い。

### 注意点
I の場合は、厳密には useFoo を実行 **していない** 何故なら、単純に Field に作った listener を渡しているだけで、帰ってきた Operator<void> を実行していないからである。
II の場合は、useFoo に listener を渡すだけだと、同期的呼び出しが判定できない。したがって、useFoo に listener を渡した後、 Operator<void> を"実行"する必要がある。
コレが何を意味しているかというと、I の手法は Operator の実装詳細によらず使えるのに対し(Monad ならできる)、II の手法は Operator の実装詳細によってしまっているということだ。
ここは抽象化が出来そうだが、とりあえず現状は一つの関数に全部まとめている。

↑の問題で、II の方針だとキャンセル処理を保持しておかなければいけない
*/

/**
 * Converts a Diagram function into a Field.
 * The Field can then be coupled with a listener and exicited.
 * @param dynamics The Diagram function.
 * @param userCtx Optional user context to pass to the Diagram.
 * @returns A Field representing the Diagram.
 */
export function toField<T>(
  dynamics: () => T,
  userCtx?: UserContext
): Scalar<T> {
  const couple = (listener: (val: T) => Operator<void>): Operator<void> => {
    const fieldUserCtx = { ...userCtx };
    // toOperator は effective である。
    // toOperator を実行した瞬間、diagram の実行が開始される
    function toOperator(
      diagram: () => T,
      history: DiagramResult[] = [] // 既に発火した use の結果の履歴
    ): Operator<void> {
      return new Interaction<void>(addFinalizeFn => {
        // 現在の use の呼び出し位置
        let currentIndex = 0;

        // use 関数
        function use<U>(fd: Scalar<U>): U {
          const index = currentIndex;
          currentIndex++;
          if (index < history.length) {
            // 履歴がある場合
            return history[index];
          }
          // 履歴が無い場合 Field を投げて終了
          throw fd;
        }

        // 現在の DIAGRAM_GLOBAL_CONTEXT を一時的に保存
        const tmp = DIAGRAM_GLOBAL_CONTEXT;
        // DIAGRAM_GLOBAL_CONTEXT をセット
        DIAGRAM_GLOBAL_CONTEXT = {
          use: use,
          getUserCtx: (): UserContext => fieldUserCtx,
        };
        try {
          currentIndex = 0;
          const result = diagram();
          DIAGRAM_GLOBAL_CONTEXT = tmp;
          const { decay } = listener(result).exicite();
          addFinalizeFn(decay);
          return;
        } catch (e: unknown) {
          DIAGRAM_GLOBAL_CONTEXT = tmp;
          if (!(e instanceof Field)) {
            throw e;
          }
          const rg = e as Scalar<DiagramResult>;
          // 継続
          const cont = (val: DiagramResult): Operator<void> => {
            // 継続呼び出しのたびに履歴を更新
            const newHistory = [...history, val];
            return toOperator(diagram, newHistory);
          };
          const { decay } = rg.couple(cont).exicite();
          addFinalizeFn(decay);
          return;
        }
      });
    }
    return toOperator(dynamics);
  };

  return new (class extends Field<[], T> {
    couple(
      listener: (val: T, coodinate: []) => Operator<void>
    ): Operator<void> {
      return couple(val => listener(val, []));
    }
  })();
}

/**
 * Uses a Field within a Diagram.
 * The Field is coupled when the Diagram executes this line.
 * If the underlying Operator is asynchronous, the Diagram execution pauses until it completes.
 * @param field The Field to use.
 */
export function use<T>(field: Scalar<T>): T {
  const global = getDiagramGlobalContext();
  return global.use(field);
}

export function useOperator<T>(operator: Operator<T>): T {
  return use(Field.ofOperator(operator));
}

/**
 * Executes a side effect with automatic cleanup.
 * The effect function is called when the Diagram executes.
 * The cleanup function (registered via addFinalizeFn) is called when the Diagram scope ends.
 * @param maker A function that performs the side effect. It receives `addFinalizeFn` to register cleanup logic and `abortSignal` for cancellation.
 */
export function useInteraction<T>(
  maker: (
    addFinalizeFn: (finalizeFn: () => MaybePromise<void>) => void,
    abortSignal: AbortSignal
  ) => MaybePromise<T>
): T {
  return useOperator(
    new Interaction<T>((addFinalizeFn, abortSignal) => {
      return maker(addFinalizeFn, abortSignal);
    })
  );
}

/**
 * Pauses execution for a specified duration.
 * @param delayMs The duration to wait in milliseconds.
 */
export function useTimeout(delayMs: number): void {
  return useInteraction((addFinalizeFn, abortSignal) => {
    return new Promise<void>(resolve => {
      let settled = false;
      const complete = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const timeout = setTimeout(() => {
        complete();
      }, delayMs);

      const onAbort = (): void => {
        clearTimeout(timeout);
        complete();
      };

      if (abortSignal.aborted) {
        onAbort();
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      addFinalizeFn(() => {
        abortSignal.removeEventListener('abort', onAbort);
        clearTimeout(timeout);
        complete();
      });
    });
  });
}

// ============================================================================
// State-related convenience functions
// ============================================================================

/**
 * Casts a Diagram into a Field by running it inside a Bridge.
 * Each value emitted by the Diagram is tracked as a Bridge entry.
 * @param diagram A Diagram function to cast.
 * @returns A Field emitting the values produced by the Diagram.
 */
export function useCast<T>(diagram: () => T): Scalar<T> {
  const userCtx = useUserContext();
  return useOperator(Bridge.cast(toField(() => diagram(), userCtx)));
}

export function useScatter<P extends unknown[], P2 extends unknown[], T, T2>(
  field: Field<P, T>,
  diagram: (val: T, coodinate: readonly [...P]) => Field<P2, T2>
): Field<[...P, ...P2], T2> {
  const userCtx = useUserContext();
  return useOperator(
    Bridge.cast(
      field.flatMap((val, coodinate) =>
        toField(() => diagram(val, coodinate), userCtx).flatMap(
          innerVal => innerVal
        )
      )
    )
  );
}

export function useCasts<P extends readonly unknown[], T, T2>(
  field: Field<P, T>,
  diagram: (val: T, coodinate: readonly [...P]) => T2
): Field<[...P], T2> {
  const userCtx = useUserContext();
  return useOperator(
    Bridge.cast(
      field.flatMap((val, coodinate) =>
        toField(() => diagram(val, coodinate), userCtx)
      )
    )
  );
}

/**
 * Create a single-value state (Atom) within a Diagram.
 * The Atom can be updated with `set()` or `modify()`, which triggers re-execution of dependent Diagrams.
 */
export function useAtom<T>(initialValue: T): Atom<T> {
  return useOperator(Operator.ofClass(Atom, initialValue));
}

/**
 * Create a multi-value state (Bridge) within a Diagram.
 * Values can be dynamically connected and disconnected via `useConnection()`.
 */
export function useBridge<P extends unknown[], T>(): Bridge<P, T> {
  return useOperator(Operator.ofClass(Bridge<P, T>));
}

/**
 * Creates a dynamic set-based state (Cluster).
 * The Cluster allows adding and removing values by identity.
 * @returns An Cluster instance.
 */
export function useCluster<P extends unknown[], T>(): Cluster<P, T> {
  return useOperator(Operator.ofClass(Cluster<P, T>));
}

/**
 * Connects a value to a Bridge.
 * The value remains connected as long as the current Diagram scope is active.
 * @param bridge The Bridge to connect to.
 * @param val The value to connect.
 */
export function useConnection<P extends unknown[], T>(
  bridge: Bridge<P, T>,
  coodinate: readonly [...P],
  val: T
): void {
  useOperator(bridge.connect(coodinate, val));
}

export function useId(): symbol {
  return useOperator(new IdOp());
}

export function useRef<T>(initialValue: T): Ref<T> {
  return useOperator(new RefOp(initialValue));
}
