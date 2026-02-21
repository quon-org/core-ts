import * as Rg from './region';
import * as Rs from './resource';
import * as Pt from './region/portal';
import * as C from './region/cell';
import { MaybePromise } from './util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlueprintResult = any;

type UserContext = Record<symbol, BlueprintResult>;

type BLUEPRINT_GLOBAL_CONTEXT_TYPE = {
  use<T>(rg: Rg.Region<T>): T;
  getUserCtx(): UserContext;
};

let BLUEPRINT_GLOBAL_CONTEXT: BLUEPRINT_GLOBAL_CONTEXT_TYPE | undefined =
  undefined;

export type Context<T> = {
  key: symbol;
  useProvider(value: T): void;
  useConsumer(): T;
};

function getBlueprintGlobalContext(): BLUEPRINT_GLOBAL_CONTEXT_TYPE {
  const global = BLUEPRINT_GLOBAL_CONTEXT;
  if (global === undefined) {
    throw new Error(
      'Blueprint context access outside of Blueprint execution. ' +
        'Make sure to call this function only within a Blueprint (inside toRealm or Store.fromBlueprint).'
    );
  }
  return global;
}

function useContextProvider<T>(key: symbol, value: T): void {
  const global = getBlueprintGlobalContext();
  useResource(
    Rs.effect<void>(addFinalizeFn => {
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
  const global = getBlueprintGlobalContext();
  const value = global.getUserCtx()[key];
  if (value === undefined) {
    const keyDescription = key.description || '<anonymous>';
    throw new Error(
      `No context value provided for key: ${keyDescription}. ` +
        'Make sure a parent Blueprint called useProvider() for this context.'
    );
  }
  // Type assertion is safe here because:
  // 1. The context key is type-branded (created by createContext<T>())
  // 2. The value is set by useProvider() with the correct type
  // 3. The symbol key ensures type consistency at compile time
  return value as T;
}

export function useUserContext(): UserContext {
  const global = getBlueprintGlobalContext();
  return { ...global.getUserCtx() };
}

/**
 * Create a context
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
同期処理を使って monadic chain を構築したい (Blueprint)

例 :
const c = () => {
  const a = useFoo();
  const b = useBar(a);
  const c = useHoge(b);
  return c;
}

### I. 通常の blueprint
まず、最終的には blueprint () => T を Rg.Region<T> に変換したい。
Rg.Region<T> ~ (listener: (val: T) => Rs.Resource<void>) => Rs.Resource<void> であるので、
listener が与えられていることを前提として、 Rs.Resource<void> を作れば良い。

今、Rs.Resource<void> を実行中とする。
たとえば、一度目の useFoo : Rg.Region<A> のところまで来た。これと listener: (val : A) => Rs.Resource<void> を用意してより大きな Rs.Resource<void> を作る。
この listener は、まず、通常の blueprint だと、発火履歴と c の組を、再帰的に実行したものである。(つまり、発火履歴があるところまでは c をそのまま実行し、発火履歴が無いところから先だけを仮想的に実行する)
そして、useFoo に作った listener を渡して自身は throw すれば、useFoo の中で listener が呼び出されるので、そこで c の続きを実行すれば良い。


### II. 同期最適化
ただし、毎回 throw しているとパフォーマンスが悪い。そこで、useFoo が listener を初回に呼び出すとき、それが同期的であったならば、throw せずに c の続きを実行しちゃう方が良い。
つまり、一旦変数 result を用意して、useFoo に listener を渡すとき、 listener を次のようにする
1. 初回、かつ同期の場合は result に値をセットし、続きの処理は実行しない。
2. それ以外の場合は通常の場合と同様。(つまり c の続きを実行する)
そして、useFoo を呼び出したあと、result に値が入っていればそれを返し、そうでなければ throw すれば良い。

### 注意点
I の場合は、厳密には useFoo を実行 **していない** 何故なら、単純に Region に作った listener を渡しているだけで、帰ってきた Rs.Resource<void> を実行していないからである。
II の場合は、useFoo に listener を渡すだけだと、同期的呼び出しが判定できない。したがって、useFoo に listener を渡した後、 Rs.Resource<void> を"実行"する必要がある。
コレが何を意味しているかというと、I の手法は Resource の実装詳細によらず使えるのに対し(Monad ならできる)、II の手法は Resource の実装詳細によってしまっているということだ。
ここは抽象化が出来そうだが、とりあえず現状は一つの関数に全部まとめている。

↑の問題で、II の方針だとキャンセル処理を保持しておかなければいけない
*/

/**
 * Convert a Blueprint function into an Rs.Resource.
 */
export function toRegion<T>(
  blueprint: () => T,
  userCtx?: UserContext
): Rg.Region<T> {
  return (listener: (val: T) => Rs.Resource<void>): Rs.Resource<void> => {
    // toResource は effective である。
    // toResource を実行した瞬間、blueprint
    function toResource(
      blueprint: () => T,
      history: BlueprintResult[] = [] // 既に発火した use の結果の履歴
    ): Rs.Resource<void> {
      return Rs.effect<void>(async addFinalizeFn => {
        const routineUserCtx = { ...userCtx };
        // 現在の use の呼び出し位置
        let currentIndex = 0;

        // use 関数
        function use<U>(rg: Rg.Region<U>): U {
          const index = currentIndex;
          currentIndex++;
          if (index < history.length) {
            // 履歴がある場合
            return history[index];
          }
          // 履歴が無い場合 Region を投げて終了
          throw rg;
        }

        // 現在の BLUEPRINT_GLOBAL_CONTEXT を一時的に保存
        const tmp = BLUEPRINT_GLOBAL_CONTEXT;
        // BLUEPRINT_GLOBAL_CONTEXT をセット
        BLUEPRINT_GLOBAL_CONTEXT = {
          use: use,
          getUserCtx: (): UserContext => routineUserCtx,
        };
        try {
          currentIndex = 0;
          const result = blueprint();
          BLUEPRINT_GLOBAL_CONTEXT = tmp;
          const { finalize } = listener(result).initialize();
          addFinalizeFn(finalize);
          return;
        } catch (e: unknown) {
          BLUEPRINT_GLOBAL_CONTEXT = tmp;
          if (e instanceof Function) {
            const rg = e as Rg.Region<BlueprintResult>;
            // 継続
            const cont = (val: BlueprintResult): Rs.Resource<void> => {
              // 継続呼び出しのたびに履歴を更新
              const newHistory = [...history, val];
              return toResource(blueprint, newHistory);
            };
            const { finalize } = rg(cont).initialize();
            addFinalizeFn(finalize);
            return;
          }
        }
      });
    }
    return toResource(blueprint);
  };
}

export function use<T>(routine: Rg.Region<T>): T {
  const global = getBlueprintGlobalContext();
  return global.use(routine);
}

export function useAll<T, U>(
  leftBlueprint: () => T,
  rightBlueprint: () => U
): [T, U] {
  return use(Rg.combine(toRegion(leftBlueprint), toRegion(rightBlueprint)));
}

export function useResource<T>(resource: Rs.Resource<T>): T {
  return use(Rg.fromResource(resource));
}

export function useEffect<T>(
  maker: (
    addFinalizeFn: (finalizeFn: () => MaybePromise<void>) => void,
    abortSignal: AbortSignal
  ) => MaybePromise<T>
): T {
  return useResource(
    Rs.effect<T>((addFinalizeFn, abortSignal) => {
      return maker(addFinalizeFn, abortSignal);
    })
  );
}

export function useTimeout(delayMs: number): void {
  return useResource(
    Rs.effect<void>((addFinalizeFn, abortSignal) => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (abortSignal.aborted) reject();
          resolve();
        }, delayMs);

        addFinalizeFn(() => {
          clearTimeout(timeout);
          reject();
        });
      });
    })
  );
}

// ============================================================================
// Store-related convenience functions
// ============================================================================

export function useCast<T>(blueprint: () => T): Rg.Region<T> {
  const userCtx = useUserContext();
  return useResource(Pt.cast(toRegion(() => blueprint(), userCtx)));
}

/**
 * Create a single-value cell within a
 * The setter replaces the current value (releases old, creates new).
 * This is a convenience wrapper around Store.newCellRealm().
 */
export function useCell<T>(initialValue: T): C.Cell<T> {
  return useResource(C.make(initialValue));
}

/**
 * Create a multi-value portal within a
 * The setter is a Blueprint function that adds/removes values.
 * Multiple values can coexist in the Store.
 * This is a convenience wrapper around Store.newPortalRealm().
 */
export function usePortal<T>(): Pt.Portal<T> {
  return useResource(Pt.make());
}

export function useConnection<T>(portal: Pt.Portal<T>, val: T): void {
  return useResource(portal.connect(val));
}
