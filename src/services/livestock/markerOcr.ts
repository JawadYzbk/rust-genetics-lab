import type { Worker as TesseractWorker } from 'tesseract.js';
import { LivestockBadgeRead } from './livestockPanelReader.ts';

/**
 * Reads the number on a marker badge (0, 4, 6, 14 ... in captures so far) with Tesseract.
 *
 * The instant shape reader in `markerDigit.ts` only knows 0 and 1. Anything else comes here,
 * once per confirmed animal rather than per frame, so OCR's cost is paid a handful of times
 * per pen, not continuously. Tesseract is loaded lazily from the same bundled assets the
 * clone scanner uses, so nothing extra is downloaded.
 */

let workerPromise: Promise<TesseractWorker | null> | null = null;

function assetUrl(path: string): string {
  try {
    return new URL(path, window.location.href).href;
  } catch {
    return `./${path}`;
  }
}

async function createDigitWorker(): Promise<TesseractWorker | null> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      workerPath: assetUrl('tesseract/worker.min.js'),
      corePath: assetUrl('tesseract/tesseract-core-lstm.wasm.js'),
      langPath: assetUrl('tesseract'),
      gzip: true
    });
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      // One line of text: a one- or two-digit number.
      tessedit_pageseg_mode: '7' as any
    });
    return worker;
  } catch (error) {
    console.warn('[Livestock] Marker OCR unavailable', error);
    return null;
  }
}

export function warmMarkerOcr(): void {
  if (!workerPromise) workerPromise = createDigitWorker();
}

/**
 * The badge's number as black-on-white at a size Tesseract reads well. Pixels brighter than
 * halfway between the badge colour and its brightest pixel are the number.
 */
export function prepareMarkerCrop(source: HTMLCanvasElement, badge: LivestockBadgeRead): HTMLCanvasElement | null {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const radius = badge.diameter * 0.38;
  const x0 = Math.max(0, Math.floor(badge.cx - radius));
  const y0 = Math.max(0, Math.floor(badge.cy - radius));
  const w = Math.min(source.width - x0, Math.ceil(radius * 2));
  const h = Math.min(source.height - y0, Math.ceil(radius * 2));
  if (w < 4 || h < 4) return null;

  const { data } = ctx.getImageData(x0, y0, w, h);
  const ringLum = 0.299 * badge.rgb[0] + 0.587 * badge.rgb[1] + 0.114 * badge.rgb[2];
  let peak = 0;
  for (let i = 0; i < data.length; i += 4) {
    peak = Math.max(peak, 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  if (peak - ringLum < 40) return null;
  const threshold = ringLum + (peak - ringLum) * 0.5;

  const scale = Math.max(1, Math.round(72 / h));
  const pad = 16;
  const out = document.createElement('canvas');
  out.width = w * scale + pad * 2;
  out.height = h * scale + pad * 2;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.fillStyle = '#000';
  const cx = badge.cx - x0;
  const cy = badge.cy - y0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) continue;
      const i = (y * w + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum >= threshold) octx.fillRect(pad + x * scale, pad + y * scale, scale, scale);
    }
  }
  return out;
}

export async function readMarkerNumber(crop: HTMLCanvasElement): Promise<number | null> {
  warmMarkerOcr();
  const worker = await workerPromise;
  if (!worker) return null;
  try {
    const { data } = await worker.recognize(crop);
    const digits = (data.text || '').replace(/\D/g, '');
    if (!digits || digits.length > 3) return null;
    return Number(digits);
  } catch {
    return null;
  }
}
