// UX-7: 自定义搜索引擎的校验与「Tab 切换引擎」的下一个引擎计算,抽成纯函数便于单测。

export type EngineValidationResult =
  | { ok: true; value: { name: string; url: string } }
  | { ok: false; error: string };

/**
 * 校验自定义搜索引擎的名称与 URL。规则与后端 add_engine 对齐:
 * 名称非空、URL 必须包含 {q} 占位符。成功时返回 trim 后的值。
 *
 * SEC(自 XSS 防御纵深): 自定义引擎 URL 之后会拼接查询词传入 `window.open`,
 * 若允许 `javascript:` / `data:` / `vbscript:` 等伪协议会造成自 XSS。
 * 这里在前端再做一次协议校验(后端 add_engine 亦已校验):
 *   - 显式带 scheme 时,只放行 http / https(大小写不敏感);
 *   - 无 scheme 的站点写法(如 `x.com/s?q={q}`)放行,沿用调用方缺省 https 的语义。
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
  // 形如 `scheme:` 的前缀(scheme 须以字母开头,只含字母/数字/+ . -)视为带协议。
  const schemeMatch = trimmedUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      return { ok: false, error: "URL 协议必须为 http 或 https" };
    }
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
