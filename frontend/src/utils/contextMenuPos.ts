export function contextMenuPosition(
  x: number,
  y: number,
  itemCount: number,
  vw: number,
  vh: number,
  menuWidth = 228,
  rowH = 42,
): { left: number; top: number } {
  const h = Math.max(itemCount, 1) * rowH + 16;
  let left = x;
  let top = y;
  if (left + menuWidth > vw - 8) left = Math.max(8, vw - menuWidth - 8);
  if (top + h > vh - 8) top = Math.max(8, y - h); // 靠近底部向上翻
  return { left, top };
}
