import { BUILTIN_ICON_OPTIONS } from "./constants";
import type { BuiltinIconName } from "./types";

// QUAL-13: 把任意字符串收敛为合法的内置图标名(不在白名单里就回退 "globe"),
// 取代原先的 `as any` 强制断言。
export function toBuiltinIconName(
  value: string | null | undefined,
): BuiltinIconName {
  return value && (BUILTIN_ICON_OPTIONS as readonly string[]).includes(value)
    ? (value as BuiltinIconName)
    : "globe";
}

export function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
