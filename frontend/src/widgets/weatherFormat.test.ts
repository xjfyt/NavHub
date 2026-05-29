import { describe, it, expect } from "vitest";
import {
  celsiusToFahrenheit,
  convertTempString,
  shouldShowWeatherSetup,
  type TempUnit,
} from "./weatherFormat";

describe("celsiusToFahrenheit", () => {
  it("0°C = 32°F", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
  });
  it("100°C = 212°F", () => {
    expect(celsiusToFahrenheit(100)).toBe(212);
  });
  it("-40°C = -40°F(交点)", () => {
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });
  it("37°C ≈ 98.6°F", () => {
    expect(celsiusToFahrenheit(37)).toBeCloseTo(98.6, 1);
  });
});

describe("convertTempString", () => {
  it("c 单位:原样返回(后端本就是摄氏)", () => {
    expect(convertTempString("23°", "c")).toBe("23°");
  });
  it("f 单位:把摄氏温度数字换算为华氏(四舍五入)", () => {
    // 23°C → 73.4°F → 73°
    expect(convertTempString("23°", "f")).toBe("73°");
  });
  it("f 单位:0° → 32°", () => {
    expect(convertTempString("0°", "f")).toBe("32°");
  });
  it("f 单位:负温度 -5° → 23°", () => {
    // -5°C → 23°F
    expect(convertTempString("-5°", "f")).toBe("23°");
  });
  it("f 单位:转换字符串内嵌的所有温度(体感)", () => {
    // “☀️ 晴 · 体感 21°” → 21°C=69.8°F→70°
    expect(convertTempString("☀️ 晴 · 体感 21°", "f")).toBe("☀️ 晴 · 体感 70°");
  });
  it("不含温度数字时原样返回(不误伤百分号/AQI)", () => {
    expect(convertTempString("60%", "f")).toBe("60%");
    expect(convertTempString("东南风", "f")).toBe("东南风");
  });
  it("空/未定义安全处理", () => {
    expect(convertTempString("", "f")).toBe("");
    expect(convertTempString(undefined, "f")).toBe("");
  });
});

describe("shouldShowWeatherSetup", () => {
  it("无城市且无数据 → 显示设置引导", () => {
    expect(shouldShowWeatherSetup("", false)).toBe(true);
    expect(shouldShowWeatherSetup("   ", false)).toBe(true);
    expect(shouldShowWeatherSetup(undefined, false)).toBe(true);
  });
  it("已设城市 → 不显示设置引导", () => {
    expect(shouldShowWeatherSetup("北京", false)).toBe(false);
  });
  it("无城市但后端已按 IP 返回了数据 → 不显示设置引导", () => {
    expect(shouldShowWeatherSetup("", true)).toBe(false);
  });
});

// TempUnit 类型存在性(编译期约束):
const _u: TempUnit[] = ["c", "f"];
void _u;
