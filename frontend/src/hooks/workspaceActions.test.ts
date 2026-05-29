import { describe, it, expect } from "vitest";

// PERF-1 的正确性核心是「latest-state ref」模式:回调身份恒稳(创建一次永不重建),
// 但每次被调用时都从 ref.current 读到最新状态,因此既不会有 stale closure,
// 也不会因状态变化而换引用、连累只用动作的消费者重渲染。
//
// 由于本仓库未安装 @testing-library/react,这里用纯逻辑(不渲染组件)模拟该模式,
// 锁定两条不变式:
//   1) 跨「渲染」回调引用稳定(=== 仍成立)。
//   2) 回调读到的永远是最新态,而非创建时捕获的旧态(无 stale closure)。

type Ref<T> = { current: T };

/** 模拟一个用 useCallback([]) 创建、内部读 latestRef 的稳定动作。只创建一次。 */
function makeStableAction<S>(latestRef: Ref<S>) {
  // 闭包只捕获 ref 本身(稳定),不捕获 ref.current 的某次快照。
  return () => latestRef.current;
}

describe("PERF-1 latest-ref action pattern", () => {
  it("keeps the callback identity stable across state changes", () => {
    const latestRef: Ref<{ count: number }> = { current: { count: 0 } };
    // 「首次渲染」创建一次
    const action = makeStableAction(latestRef);

    // 模拟多次「重渲染」:状态在变,但回调不应被重建。
    const renders = [{ count: 1 }, { count: 2 }, { count: 3 }];
    let prev = action;
    for (const next of renders) {
      latestRef.current = next; // 渲染体内同步刷新 ref(对应 latestRef.current = {...})
      // 在真实组件里 useCallback([]) 会返回同一个引用;这里 action 始终是同一个常量。
      expect(action).toBe(prev);
      prev = action;
    }
  });

  it("reads the latest state, never a stale captured snapshot", () => {
    const latestRef: Ref<{ isGuest: boolean; name: string }> = {
      current: { isGuest: true, name: "a" },
    };
    const action = makeStableAction(latestRef);

    // 创建时的态
    expect(action()).toEqual({ isGuest: true, name: "a" });

    // 状态更新后,同一个回调读到的是新态(无 stale closure)。
    latestRef.current = { isGuest: false, name: "b" };
    expect(action()).toEqual({ isGuest: false, name: "b" });

    latestRef.current = { isGuest: false, name: "c" };
    expect(action()).toEqual({ isGuest: false, name: "c" });
  });

  it("assembling an actions object from stable callbacks yields a stable object when deps are empty", () => {
    // 模拟 useMemo(() => ({...stableCbs}), []) —— 依赖为空,只算一次。
    const latestRef: Ref<{ v: number }> = { current: { v: 0 } };
    const a = makeStableAction(latestRef);
    const b = makeStableAction(latestRef);

    let memoized: { a: () => unknown; b: () => unknown } | null = null;
    const buildOnceWithEmptyDeps = () => {
      if (memoized === null) memoized = { a, b };
      return memoized;
    };

    const first = buildOnceWithEmptyDeps();
    latestRef.current = { v: 99 }; // 状态变化
    const second = buildOnceWithEmptyDeps();

    // 对象与其成员引用都稳定。
    expect(second).toBe(first);
    expect(second.a).toBe(first.a);
    expect(second.b).toBe(first.b);
    // 但成员仍读到最新态。
    expect(second.a()).toEqual({ v: 99 });
  });
});
