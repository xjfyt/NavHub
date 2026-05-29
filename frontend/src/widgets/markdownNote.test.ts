import { describe, it, expect } from "vitest";
import { plainPreview, deriveTitle } from "./markdownNote";

describe("plainPreview", () => {
  it("剥离标题井号与强调符号", () => {
    expect(plainPreview("# 标题\n正文**加粗**")).toBe("标题 正文加粗");
  });

  it("行内链接保留文字、去掉地址", () => {
    expect(plainPreview("点击 [这里](https://example.com) 查看")).toBe(
      "点击 这里 查看",
    );
  });

  it("图片被整体移除", () => {
    expect(plainPreview("前 ![alt](http://img.png) 后")).toBe("前  后");
  });

  it("反引号被先剥离,围栏代码块退化为其内容文本(保留既有行为)", () => {
    // 实现里 [*_`>#] 的替换早于 ``` 围栏正则,先吃掉反引号,故围栏
    // 不再成对、占位符「代码」不会出现。固化此既有行为。
    expect(plainPreview("说明\n```\nconst a = 1;\n```\n结束")).toBe(
      "说明 const a = 1; 结束",
    );
  });

  it("按 limit 截断", () => {
    expect(plainPreview("一二三四五六", 3)).toBe("一二三");
  });

  it("默认 limit 为 80", () => {
    const long = "字".repeat(200);
    expect(plainPreview(long).length).toBe(80);
  });

  it("空内容返回空串", () => {
    expect(plainPreview("")).toBe("");
  });
});

describe("deriveTitle", () => {
  it("取首个非空行并去掉标题井号", () => {
    expect(deriveTitle("## 我的笔记\n内容")).toBe("我的笔记");
  });

  it("跳过空行取第一行有效内容", () => {
    expect(deriveTitle("\n\n  实际标题\n更多")).toBe("实际标题");
  });

  it("剥离行内强调符号", () => {
    expect(deriveTitle("**重点** 与 `代码`")).toBe("重点 与 代码");
  });

  it("超过 32 字截断", () => {
    expect(deriveTitle("字".repeat(40)).length).toBe(32);
  });

  it("全空内容回落到 fallback", () => {
    expect(deriveTitle("   \n  ", "未命名笔记")).toBe("未命名笔记");
    expect(deriveTitle("")).toBe("未命名笔记");
  });

  it("自定义 fallback 生效", () => {
    expect(deriveTitle("", "草稿")).toBe("草稿");
  });
});
