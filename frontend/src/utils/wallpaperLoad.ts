import { imageHasPixels } from "./wallpaperDisplay";

export const IMAGE_RETRY_DELAYS_MS = [1_000, 3_000, 8_000, 15_000];
export const IMAGE_LOAD_TIMEOUT_MS = 20_000;
export const IMAGE_DECODE_TIMEOUT_MS = 8_000;
export const VIDEO_READY_TIMEOUT_MS = 12_000;

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** 解码完成才算成功；0×0 / error / 超时都失败，不能当成 loaded。 */
export function loadWallpaperImage(
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    const img = new window.Image();
    img.decoding = "async";
    let settled = false;
    let loadTimer: number | undefined;
    let decodeTimer: number | undefined;

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
      if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      img.src = "";
      reject(err);
    };
    const ok = () => {
      if (settled) return;
      if (!imageHasPixels(img)) {
        fail(new Error("empty image"));
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => fail(abortError());

    img.onload = () => {
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
      const decode = img.decode
        ? img.decode().then(ok, () => {
            // decode 失败但 onload 已触发且有像素：仍可绘制。
            ok();
          })
        : Promise.resolve().then(ok);
      void decode;
      decodeTimer = window.setTimeout(() => {
        if (!settled && imageHasPixels(img)) ok();
      }, IMAGE_DECODE_TIMEOUT_MS);
    };
    img.onerror = () => fail(new Error("image error"));
    loadTimer = window.setTimeout(() => {
      fail(new Error("image timeout"));
    }, IMAGE_LOAD_TIMEOUT_MS);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }
    img.src = url;
  });
}

export function loadWallpaperVideo(
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    let timer: number | undefined;

    const cleanup = () => {
      video.onloadeddata = null;
      video.onerror = null;
      if (timer !== undefined) window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      video.removeAttribute("src");
      video.load();
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => fail(abortError());

    video.onloadeddata = () => ok();
    video.onerror = () => fail(new Error("video error"));
    timer = window.setTimeout(
      () => fail(new Error("video timeout")),
      VIDEO_READY_TIMEOUT_MS,
    );
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }
    video.src = url;
  });
}

export async function loadWallpaperAsset(
  url: string,
  mediaType: "image" | "video",
  signal?: AbortSignal,
): Promise<void> {
  if (mediaType === "video") return loadWallpaperVideo(url, signal);
  return loadWallpaperImage(url, signal);
}
