import { describe, expect, it } from "vitest";
import { otherSurfaces, WORKSPACE_SURFACES } from "./exclusiveSurface";

describe("otherSurfaces", () => {
  it("打开组件库时关掉添加图标、资料、右键菜单", () => {
    const closed = otherSurfaces("catalog");
    expect(closed).toContain("addIcon");
    expect(closed).toContain("profile");
    expect(closed).toContain("ctx");
    expect(closed).toContain("userMenu");
    expect(closed).not.toContain("catalog");
  });

  it("打开任意一块都不会关掉自己，且覆盖全部其它块", () => {
    for (const keep of WORKSPACE_SURFACES) {
      const closed = otherSurfaces(keep);
      expect(closed).not.toContain(keep);
      expect(closed).toHaveLength(WORKSPACE_SURFACES.length - 1);
    }
  });
});
