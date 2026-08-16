/**
 * Scroll metrics and banded scrolling for full-page capture. The service
 * worker drives the loop but has no DOM, so measuring and scrolling have to
 * happen here.
 */

export const PAGE_METRICS_SOURCE = `
  const de = document.documentElement;
  const body = document.body;
  return {
    scrollHeight: Math.max(de.scrollHeight, body ? body.scrollHeight : 0),
    scrollWidth: Math.max(de.scrollWidth, body ? body.scrollWidth : 0),
    clientHeight: de.clientHeight,
    clientWidth: de.clientWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    dpr: window.devicePixelRatio || 1
  };
`;

/** Scrolls to `ctx.y` and reports where the browser actually landed. */
export const SCROLL_TO_SOURCE = `
  window.scrollTo(0, ctx.y);
  await new Promise((r) => setTimeout(r, ctx.settleMs || 120));
  return { scrollY: window.scrollY };
`;

/**
 * Stitches captured bands onto a canvas. Runs in the page rather than the
 * worker because a service worker has no Image decoding path that works for
 * data URLs across all Chrome versions.
 */
export const STITCH_SOURCE = `
  const bands = ctx.bands;
  const width = ctx.width;
  const height = ctx.height;
  const format = ctx.format === "jpeg" ? "image/jpeg" : "image/png";
  const scale = typeof ctx.scale === "number" && ctx.scale > 0 && ctx.scale <= 1 ? ctx.scale : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext("2d");
  if (!g) return { ok: false, error: "canvas 2d context unavailable" };

  for (const band of bands) {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("band decode failed"));
      i.src = band.dataUrl;
    });
    g.drawImage(
      img,
      0, 0, img.width, img.height,
      0, Math.round(band.y * scale),
      Math.round(width * scale), Math.round((img.height / img.width) * width * scale)
    );
  }

  const out = canvas.toDataURL(format, format === "image/jpeg" ? 0.9 : undefined);
  return { ok: true, dataUrl: out, width: canvas.width, height: canvas.height };
`;
