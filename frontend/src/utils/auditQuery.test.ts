import { describe, it, expect } from "vitest";
import {
  AUDIT_KINDS,
  buildAuditParams,
  type AuditFilterState,
} from "./auditQuery";

const base = (): AuditFilterState => ({
  q: "",
  kind: "",
  page: 0,
  pageSize: 50,
});

describe("buildAuditParams", () => {
  it("默认状态只下发 limit/offset", () => {
    expect(buildAuditParams(base())).toEqual({ limit: 50, offset: 0 });
  });

  it("携带搜索词 q(去除首尾空白)", () => {
    expect(buildAuditParams({ ...base(), q: "  delete_group  " })).toEqual({
      q: "delete_group",
      limit: 50,
      offset: 0,
    });
  });

  it("空白 q 视为未填", () => {
    expect(buildAuditParams({ ...base(), q: "   " })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it("携带有效的 kind", () => {
    expect(buildAuditParams({ ...base(), kind: "icon" })).toEqual({
      kind: "icon",
      limit: 50,
      offset: 0,
    });
  });

  it("非法 kind 被忽略", () => {
    expect(buildAuditParams({ ...base(), kind: "bogus" })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it("根据页码计算 offset", () => {
    expect(buildAuditParams({ ...base(), page: 2 })).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it("负页码被夹到 0", () => {
    expect(buildAuditParams({ ...base(), page: -3 }).offset).toBe(0);
  });

  it("非法 pageSize 回退到默认 50,且至少为 1", () => {
    expect(buildAuditParams({ ...base(), pageSize: 0 }).limit).toBe(50);
    expect(buildAuditParams({ ...base(), pageSize: -10 }).limit).toBe(50);
    expect(buildAuditParams({ ...base(), pageSize: Number.NaN }).limit).toBe(
      50,
    );
  });

  it("pageSize 超过 500 被夹到 500(与后端 clamp 对齐)", () => {
    expect(buildAuditParams({ ...base(), pageSize: 9999 }).limit).toBe(500);
  });

  it("组合所有参数", () => {
    expect(
      buildAuditParams({ q: "admin", kind: "user", page: 1, pageSize: 20 }),
    ).toEqual({ q: "admin", kind: "user", limit: 20, offset: 20 });
  });
});

describe("AUDIT_KINDS", () => {
  it("覆盖后端写入的全部 kind", () => {
    const ids = AUDIT_KINDS.map((k) => k.id);
    expect(ids).toEqual([
      "group",
      "icon",
      "user",
      "widget",
      "auth",
      "sso",
      "message",
      "settings",
    ]);
  });
});
