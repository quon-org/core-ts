import { Field } from './field';
import { Atom } from './field/atom';
import { Portal } from './field/portal';
import { Effect, Matter } from './matter';
import { MaybePromise } from './util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlueprintResult = any;

type UserContext = Record<symbol, BlueprintResult>;

type BLUEPRINT_GLOBAL_CONTEXT_TYPE = {
  use<T>(rg: Field<T>): T;
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
  useMatter(
    new Effect<void>(addFinalizeFn => {
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
export function toField<T>(dynamics: () => T, userCtx?: UserContext): Field<T> {
  const couple = (listener: (val: T) => Matter<void>): Matter<void> => {
    const routineUserCtx = { ...userCtx };
    // toResource は effective である。
    // toResource を実行した瞬間、blueprint
    function toResource(
      blueprint: () => T,
      history: BlueprintResult[] = [] // 既に発火した use の結果の履歴
    ): Matter<void> {
      return new Effect<void>(addFinalizeFn => {
        // 現在の use の呼び出し位置
        let currentIndex = 0;

        // use 関数
        function use<U>(fd: Field<U>): U {
          const index = currentIndex;
          currentIndex++;
          if (index < history.length) {
            // 履歴がある場合
            return history[index];
          }
          // 履歴が無い場合 Region を投げて終了
          throw fd;
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
          const { vanish } = listener(result).materialize();
          addFinalizeFn(vanish);
          return;
        } catch (e: unknown) {
          BLUEPRINT_GLOBAL_CONTEXT = tmp;
          if (!(e instanceof Field)) {
            throw e;
          }
          const rg = e as Field<BlueprintResult>;
          // 継続
          const cont = (val: BlueprintResult): Matter<void> => {
            // 継続呼び出しのたびに履歴を更新
            const newHistory = [...history, val];
            return toResource(blueprint, newHistory);
          };
          const { vanish } = rg.couple(cont).materialize();
          addFinalizeFn(vanish);
          return;
        }
      });
    }
    return toResource(dynamics);
  };

  return new (class extends Field<T> {
    couple(listener: (val: T) => Matter<void>): Matter<void> {
      return couple(listener);
    }
  })();
}

export function use<T>(field: Field<T>): T {
  const global = getBlueprintGlobalContext();
  return global.use(field);
}

export function useAppended<T>(
  leftBlueprint: () => T,
  rightBlueprint: () => T
): T {
  const leftField = toField(leftBlueprint);
  const rightField = toField(rightBlueprint);
  return use(leftField.append(rightField));
}

export function useConcatenated<T>(blueprints: (() => T)[]): T {
  const fields = blueprints.map(bp => toField(bp));
  return use(Field.concat(fields));
}

export function useMatter<T>(matter: Matter<T>): T {
  return use(Field.ofMatter(matter));
}

export function useEffect<T>(
  maker: (
    addFinalizeFn: (finalizeFn: () => MaybePromise<void>) => void,
    abortSignal: AbortSignal
  ) => MaybePromise<T>
): T {
  return useMatter(
    new Effect<T>((addFinalizeFn, abortSignal) => {
      return maker(addFinalizeFn, abortSignal);
    })
  );
}

export function useTimeout(delayMs: number): void {
  return useEffect((addFinalizeFn, abortSignal) => {
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
// Store-related convenience functions
// ============================================================================

export function useCast<T>(blueprint: () => T): Field<T> {
  const userCtx = useUserContext();
  return useMatter(Portal.cast(toField(() => blueprint(), userCtx)));
}

/**
 * Create a single-value cell within a
 * The setter replaces the current value (releases old, creates new).
 * This is a convenience wrapper around Store.newCellRealm().
 */
export function useAtom<T>(initialValue: T): Atom<T> {
  return useMatter(Matter.ofClass(Atom, initialValue));
}

/**
 * Create a multi-value portal within a
 * The setter is a Blueprint function that adds/removes values.
 * Multiple values can coexist in the Store.
 * This is a convenience wrapper around Store.newPortalRealm().
 */
export function usePortal<T>(): Portal<T> {
  return useMatter(Matter.ofClass(Portal<T>));
}

export function useConnection<T>(portal: Portal<T>, val: T): void {
  useMatter(portal.connect(val));
}
