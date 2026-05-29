// QUAL-10 / TEST-2: 把工作区里的「重排」纯计算从 useWorkspace.tsx 抽离到此模块。
// 这些函数全部无副作用:输入数组 + 拖放参数,输出新数组(或 null/原引用表示「不处理」),
// 不触碰 setState、不发请求,因而可被详尽单测覆盖。Hook 只负责把结果接到 setWorkspace / API。

/**
 * 把 `fromId` 这一项移动到 `toId` 当前所在的位置(「移动到目标之前/替换其槽位」的语义,
 * 与原先 splice(remove) -> splice(insert at target index) 完全一致)。
 *
 * - from 或 to 不存在 -> 返回**原数组引用**(调用方据此判定「无变化」,直接 return)。
 * - from === to -> 行为上等价 no-op(返回内容相同的新数组)。
 * - 纯函数:不修改入参。
 */
export function moveById<T extends { id: string }>(
  items: T[],
  fromId: string,
  toId: string,
): T[] {
  const next = items.slice();
  const fi = next.findIndex((x) => x.id === fromId);
  const ti = next.findIndex((x) => x.id === toId);
  if (fi < 0 || ti < 0) return items;
  const [m] = next.splice(fi, 1);
  next.splice(ti, 0, m);
  return next;
}

/**
 * 重排分组:语义与 moveById 相同,仅作语义化命名,供 reorderGroup 调用。
 * 无效 id 时返回原引用。
 */
export function reorderGroups<T extends { id: string }>(
  groups: T[],
  oldId: string,
  newId: string,
): T[] {
  return moveById(groups, oldId, newId);
}

/**
 * 在「同一分组内」重排图标。整份 icons 数组里可能混着多个分组,这里:
 *   1. 校验 drag/drop 均存在且同组,否则返回 null(调用方 return,不做任何事)。
 *   2. 仅在该分组的子序列上做 moveById 式重排。
 *   3. 返回 { icons, order, groupId }:
 *      - icons —— 新的整份数组,布局为 [其它分组原样..., 重排后的本组...]
 *        (与原实现 `[...rest, ...sameGroup]` 一致)。
 *      - order —— 本组重排后的 id 顺序,用于回写 api.reorderIcons。
 *      - groupId —— 本组 id。
 * 纯函数:不修改入参。
 */
export function reorderIconsInGroup<T extends { id: string; groupId: string }>(
  icons: T[],
  dragId: string,
  dropId: string,
): { icons: T[]; order: string[]; groupId: string } | null {
  const drag = icons.find((i) => i.id === dragId);
  const drop = icons.find((i) => i.id === dropId);
  if (!drag || !drop || drag.groupId !== drop.groupId) return null;

  const sameGroup = icons.filter((i) => i.groupId === drag.groupId);
  const fi = sameGroup.findIndex((i) => i.id === dragId);
  const ti = sameGroup.findIndex((i) => i.id === dropId);
  if (fi < 0 || ti < 0) return null;

  const [m] = sameGroup.splice(fi, 1);
  sameGroup.splice(ti, 0, m);

  const rest = icons.filter((i) => i.groupId !== drag.groupId);
  const order = sameGroup.map((i) => i.id);
  return { icons: [...rest, ...sameGroup], order, groupId: drag.groupId };
}

/**
 * 按显式 id 顺序重排一组带 sortOrder 的项(文件夹内排序):
 *   - 依 `order` 逐个取出对应项,未知 id 跳过;
 *   - 重写每项的 sortOrder 为其新下标;
 *   - 不在 order 中的项会被丢弃(与原实现「以 order 为准重建」一致)。
 * 纯函数:返回新数组、新对象,不修改入参。
 */
export function reorderByIdList<T extends { id: string; sortOrder: number }>(
  items: T[],
  order: string[],
): T[] {
  const byId = new Map(items.map((it) => [it.id, it] as const));
  return order
    .map((id, idx) => {
      const it = byId.get(id);
      return it ? { ...it, sortOrder: idx } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
