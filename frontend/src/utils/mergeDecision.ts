// UX-20: 文件夹合并的「是否应当合并」纯决策逻辑。
//
// 背景：改造前只要拖拽图标与目标图标有一点点重叠（普通 30% / 文件夹 18%）就立刻
// 标记为合并目标，松手即合并。体验上「擦一下就吸进去」，非常容易误触——用户本意
// 只是想把图标拖到旁边重新排序，却被吞进了文件夹。
//
// 这里把判定收紧为「更刻意的重叠」：
//   1. 抬高重叠门槛——必须把被拖图标的相当一部分压进目标中心区，而不是边缘相蹭：
//        普通图标 0.55、文件夹 0.45（仍比普通图标低，文件夹本就是收纳容器）。
//   2. 引入「停留(dwell)」——刚越过门槛的瞬间不立即生效，需要在目标上保持足够重叠
//        持续 DWELL_MS 毫秒才确认为合并目标。轻轻划过即便短暂越过门槛也不会触发。
//
// 决策被拆成纯函数：输入 = 当前重叠率 + 该目标已持续达标的时长 + 是否文件夹，
// 输出 = 是否确认为合并目标。便于单测（擦过→不合并；深度重叠且停留够→合并）。

/** 普通图标合并所需的最小重叠率（被拖图标自身面积口径）。 */
export const MERGE_OVERLAP_THRESHOLD_ICON = 0.55;
/** 文件夹合并所需的最小重叠率（容器，门槛略低）。 */
export const MERGE_OVERLAP_THRESHOLD_FOLDER = 0.45;
/** 越过门槛后还需持续停留多久(ms)才确认为合并目标。 */
export const MERGE_DWELL_MS = 280;

export interface MergeDecisionInput {
  /** 被拖图标与候选目标的重叠率(交集面积 / 被拖图标面积)，范围约 [0,1]。 */
  overlapRatio: number;
  /** 自从「持续达到门槛」以来，在该目标上停留的时长(ms)。未达门槛应传 0。 */
  dwellMs: number;
  /** 候选目标是否为文件夹。 */
  isFolder: boolean;
}

/** 该重叠率是否已达到「候选合并目标」的门槛(尚未计停留)。 */
export function meetsMergeOverlap(
  overlapRatio: number,
  isFolder: boolean,
): boolean {
  if (!Number.isFinite(overlapRatio) || overlapRatio <= 0) return false;
  const threshold = isFolder
    ? MERGE_OVERLAP_THRESHOLD_FOLDER
    : MERGE_OVERLAP_THRESHOLD_ICON;
  return overlapRatio >= threshold;
}

/**
 * 是否确认为合并目标：既要重叠率达门槛，又要在该目标上停留够 MERGE_DWELL_MS。
 * 这样「擦过」（短暂越过门槛但停留不足）不会被判为合并。
 */
export function shouldMergeWithTarget(input: MergeDecisionInput): boolean {
  if (!meetsMergeOverlap(input.overlapRatio, input.isFolder)) return false;
  if (!Number.isFinite(input.dwellMs) || input.dwellMs < 0) return false;
  return input.dwellMs >= MERGE_DWELL_MS;
}
