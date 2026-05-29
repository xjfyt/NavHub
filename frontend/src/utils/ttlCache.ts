// PERF-3: 带 TTL 的内存缓存 + 在途请求去重。
//
// 设计目标:同一份数据(由 key 标识)在 TTL 窗口内只发一次网络请求,
// 磁贴与详情、以及短时间内的重复挂载都从缓存命中;并发的相同 key 调用
// 共享同一个 Promise(在途去重),避免「同一秒内两个组件各发一次」。
//
// 纯逻辑、无 React 依赖,便于单测。Date.now() 在应用代码中允许使用。

interface Entry<V> {
  value: V;
  /** 绝对过期时间戳(ms);Date.now() >= expireAt 即视为过期。 */
  expireAt: number;
}

export interface TtlCache<V> {
  /** 命中且未过期返回值,否则返回 undefined(并顺手清除过期条目)。 */
  get(key: string): V | undefined;
  /** 写入值;ttlMs<=0 表示不缓存(立即过期)。 */
  set(key: string, value: V, ttlMs: number): void;
  /**
   * 命中缓存直接返回;否则发起 fetcher,并对相同 key 的并发调用去重——
   * 它们共享同一个在途 Promise。成功后按 ttlMs 写入缓存;失败则清除在途
   * 记录(不缓存),以便后续重试。
   */
  getOrFetch(key: string, fetcher: () => Promise<V>, ttlMs: number): Promise<V>;
  /** 移除指定 key 的缓存值(不影响在途请求)。 */
  invalidate(key: string): void;
  /** 清空所有缓存值(不影响在途请求)。 */
  clear(): void;
  /** 当前有效(未过期)条目数,主要供测试断言。 */
  size(): number;
}

export function createTtlCache<V>(): TtlCache<V> {
  const store = new Map<string, Entry<V>>();
  const inflight = new Map<string, Promise<V>>();

  function get(key: string): V | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expireAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key: string, value: V, ttlMs: number): void {
    if (ttlMs <= 0) {
      // 不缓存:同时清掉可能存在的旧条目。
      store.delete(key);
      return;
    }
    store.set(key, { value, expireAt: Date.now() + ttlMs });
  }

  function getOrFetch(
    key: string,
    fetcher: () => Promise<V>,
    ttlMs: number,
  ): Promise<V> {
    const cached = get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = fetcher()
      .then((value) => {
        set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, promise);
    return promise;
  }

  function invalidate(key: string): void {
    store.delete(key);
  }

  function clear(): void {
    store.clear();
  }

  function size(): number {
    // 顺带剔除已过期条目,保证返回的是有效条目数。
    const now = Date.now();
    for (const [k, entry] of store) {
      if (now >= entry.expireAt) store.delete(k);
    }
    return store.size;
  }

  return { get, set, getOrFetch, invalidate, clear, size };
}
