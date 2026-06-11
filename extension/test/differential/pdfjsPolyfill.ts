// Vitest setup — make the Node test env look like the browser Worker the engine
// actually runs in, so the SAME engine code path is exercised. pdf.js v6 assumes
// APIs that are native in target Chrome/Edge but missing in Node 24:
//   * DOMMatrix / Path2D / ImageData / OffscreenCanvas — backed by @napi-rs/canvas
//     (prebuilt, Windows-friendly) so pdf.js can parse AND render (z_index).
//   * Uint8Array.prototype.toHex, Map.prototype.getOrInsertComputed,
//     Math.sumPrecise — recent TC39 additions pdf.js relies on.
// In the production Worker these are all native; this file is test-only.
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';

const g = globalThis as unknown as Record<string, unknown>;

g.DOMMatrix = DOMMatrix;
g.Path2D = Path2D;
g.ImageData = ImageData;
g.OffscreenCanvas = class {
  constructor(width: number, height: number) {
    return createCanvas(width, height);
  }
};

interface U8Hex {
  toHex?: () => string;
}
const u8 = Uint8Array.prototype as unknown as U8Hex;
if (!u8.toHex) {
  u8.toHex = function (this: Uint8Array): string {
    return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
  };
}

interface MapInsert {
  getOrInsertComputed?: <K, V>(key: K, fn: (key: K) => V) => V;
}
const mp = Map.prototype as unknown as MapInsert;
if (!mp.getOrInsertComputed) {
  mp.getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, fn: (key: K) => V): V {
    if (!this.has(key)) this.set(key, fn(key));
    return this.get(key) as V;
  };
}

interface MathSum {
  sumPrecise?: (values: Iterable<number>) => number;
}
const mth = Math as unknown as MathSum;
if (!mth.sumPrecise) {
  mth.sumPrecise = (values: Iterable<number>): number => {
    let sum = 0;
    for (const v of values) sum += v;
    return sum;
  };
}
