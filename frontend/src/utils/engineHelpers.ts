// UX-7: 自定义搜索引擎的校验与「Tab 切换引擎」的下一个引擎计算,抽成纯函数便于单测。

export type EngineValidationResult =
  | { ok: true; value: { name: string; url: string } }
  | { ok: false; error: string };

/**
 * 校验自定义搜索引擎的名称与 URL。规则与后端 add_engine 对齐:
 * 名称非空、URL 必须包含 {q} 占位符。成功时返回 trim 后的值。
 */
export function validateEngineInput(
  name: string,
  url: string,
): EngineValidationResult {
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  if (!trimmedName || !trimmedUrl.includes("{q}")) {
    return { ok: false, error: "名称不能为空，且 URL 必须包含 {q}" };
  }
  return { ok: true, value: { name: trimmedName, url: trimmedUrl } };
}

/**
 * 在给定的引擎 id 顺序里,返回 currentId 的下一个(到末尾回绕)。
 * - 列表为空时原样返回 currentId(无可切换)。
 * - currentId 不在列表中时返回第一个。
 */
export function nextEngineId(ids: string[], currentId: string): string {
  if (ids.length === 0) return currentId;
  const idx = ids.indexOf(currentId);
  if (idx === -1) return ids[0];
  return ids[(idx + 1) % ids.length];
}
