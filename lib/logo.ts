/** Default coin-style logo (no real person's likeness) generated from the token symbol. */
export function coinLogoSvg(symbol: string): string {
  const letter = (symbol.match(/[A-Z0-9]/)?.[0] ?? "T").replace(/[^A-Z0-9]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ff4d6d"/><stop offset="0.55" stop-color="#d90429"/><stop offset="1" stop-color="#7a0016"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#f5b700"/><stop offset="1" stop-color="#b37400"/></linearGradient>
  </defs>
  <circle cx="256" cy="256" r="248" fill="url(#rim)"/>
  <circle cx="256" cy="256" r="222" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="196" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round"/>
  <g fill="#ffe08a">
    <path d="M256 70 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2z"/>
    <path d="M150 112 l5 10 11 1.5 -8 7.5 2 11 -10 -5.5 -10 5.5 2 -11 -8 -7.5 11 -1.5z"/>
    <path d="M362 112 l5 10 11 1.5 -8 7.5 2 11 -10 -5.5 -10 5.5 2 -11 -8 -7.5 11 -1.5z"/>
  </g>
  <text x="256" y="350" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="250" fill="#fff" stroke="#5c0010" stroke-opacity="0.35" stroke-width="5">${letter}</text>
  <ellipse cx="200" cy="150" rx="120" ry="60" fill="#fff" opacity="0.10" transform="rotate(-25 200 150)"/>
</svg>`;
}

/** Renders an image source (object URL or data URL) to a square PNG of `size` px, centered and cover-cropped. */
export async function renderPng(src: string, size: number): Promise<Uint8Array> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  const w = img.naturalWidth || size, h = img.naturalHeight || size;
  const s = Math.max(size / w, size / h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG export failed."))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
