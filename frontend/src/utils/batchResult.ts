// UX-18: 批量操作(批量上传等)的成功/失败聚合。
//
// 之前批量上传把错误吞掉、或不管成败一律弹「上传成功」。这里把「逐项结果 → 汇总」
// 的纯逻辑抽出来,便于单测,并给出统一的「成功 X，失败 Y」文案。

export interface BatchItemResult {
  ok: boolean;
  /** 失败原因(可选),用于汇总展示。 */
  error?: string;
}

export interface BatchSummary {
  ok: number;
  fail: number;
  total: number;
  /** 去重保序的失败原因列表。 */
  errors: string[];
}

export function summarizeBatch(results: BatchItemResult[]): BatchSummary {
  let ok = 0;
  let fail = 0;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.ok) {
      ok += 1;
    } else {
      fail += 1;
      const msg = r.error?.trim();
      if (msg && !seen.has(msg)) {
        seen.add(msg);
        errors.push(msg);
      }
    }
  }
  return { ok, fail, total: results.length, errors };
}

/**
 * 把汇总格式化成中文文案:
 *   - 全部成功 → "成功 X"
 *   - 全部失败 → "失败 Y"
 *   - 混合     → "成功 X，失败 Y"
 *   - 空批次   → ""
 * unit 可选(如 "张" / "个"),用于补单位:"成功 2 张，失败 1 张"。
 */
export function formatBatchSummary(summary: BatchSummary, unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  const okPart = `成功 ${summary.ok}${u}`;
  const failPart = `失败 ${summary.fail}${u}`;
  if (summary.total === 0) return "";
  if (summary.fail === 0) return okPart;
  if (summary.ok === 0) return failPart;
  return `${okPart}，${failPart}`;
}
