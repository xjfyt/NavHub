import { describe, it, expect } from "vitest";
import {
  connectivityReducer,
  initialConnectivity,
  selectBanner,
  type ConnectivityState,
} from "./connectivity";

describe("connectivityReducer", () => {
  it("初始态:在线 + 后端未知,无横幅", () => {
    const s = initialConnectivity(true);
    expect(s.online).toBe(true);
    expect(s.backend).toBe("unknown");
    expect(selectBanner(s)).toBeNull();
  });

  it("初始态可反映离线", () => {
    const s = initialConnectivity(false);
    expect(s.online).toBe(false);
    expect(selectBanner(s)?.kind).toBe("offline");
  });

  it("offline 事件 → 离线横幅(优先级最高)", () => {
    let s = initialConnectivity(true);
    s = connectivityReducer(s, { type: "offline" });
    expect(s.online).toBe(false);
    expect(selectBanner(s)?.kind).toBe("offline");
  });

  it("online 事件恢复在线;若后端此前可达则无横幅", () => {
    let s: ConnectivityState = { online: false, backend: "reachable" };
    s = connectivityReducer(s, { type: "online" });
    expect(s.online).toBe(true);
    expect(selectBanner(s)).toBeNull();
  });

  it("backend_error → 后端不可达横幅(在线时)", () => {
    let s = initialConnectivity(true);
    s = connectivityReducer(s, { type: "backend_error" });
    expect(s.backend).toBe("unreachable");
    expect(selectBanner(s)?.kind).toBe("backend");
  });

  it("backend_ok 清除后端不可达", () => {
    let s: ConnectivityState = { online: true, backend: "unreachable" };
    s = connectivityReducer(s, { type: "backend_ok" });
    expect(s.backend).toBe("reachable");
    expect(selectBanner(s)).toBeNull();
  });

  it("离线优先于后端错误", () => {
    let s = initialConnectivity(true);
    s = connectivityReducer(s, { type: "backend_error" });
    s = connectivityReducer(s, { type: "offline" });
    expect(selectBanner(s)?.kind).toBe("offline");
  });

  it("浏览器离线时即便后端 ok 也判离线", () => {
    const s: ConnectivityState = { online: false, backend: "reachable" };
    expect(selectBanner(s)?.kind).toBe("offline");
  });

  it("未知后端状态(尚未探测)不显示后端横幅", () => {
    const s: ConnectivityState = { online: true, backend: "unknown" };
    expect(selectBanner(s)).toBeNull();
  });

  it("reducer 不可变:返回新对象", () => {
    const s = initialConnectivity(true);
    const next = connectivityReducer(s, { type: "offline" });
    expect(next).not.toBe(s);
    expect(s.online).toBe(true); // 原对象未被改写
  });
});
