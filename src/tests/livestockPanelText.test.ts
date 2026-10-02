import { describe, it, expect } from 'vitest';
import {
  BinaryGlyph,
  classifyGlyph,
  readAgeSeconds,
  readDigits,
  readPercent
} from '../services/livestock/panelText.ts';
import { GLYPH_GRID_HEIGHT, GLYPH_GRID_WIDTH, GLYPH_TEMPLATES } from '../services/livestock/glyphTemplateData.ts';
import { readLivestockPanel } from '../services/livestock/livestockPanelReader.ts';
import { readMarkerDigit } from '../services/livestock/markerDigit.ts';
import { readPanelConditions } from '../services/livestock/panelConditions.ts';
import { createAnimal, decodeGeneRow } from '../domain/livestock/animal.ts';
import { currentCondition, estimateAnimalPrice } from '../domain/livestock/pricing.ts';
import { RasterImage } from '../services/scanner/scannerTypes.ts';

/** A character drawn from its own reference grid at `height` pixels, placed at `x0`. */
function glyphOf(char: string, height: number, x0: number): BinaryGlyph {
  const t = GLYPH_TEMPLATES.find((g) => g.char === char)!;
  const width = Math.max(2, Math.round(height * t.aspect));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = Math.min(GLYPH_GRID_WIDTH - 1, Math.floor((x / width) * GLYPH_GRID_WIDTH));
      const gy = Math.min(GLYPH_GRID_HEIGHT - 1, Math.floor((y / height) * GLYPH_GRID_HEIGHT));
      mask[y * width + x] = Number(t.grid[gy * GLYPH_GRID_WIDTH + gx]) >= 5 ? 1 : 0;
    }
  }
  return { mask, width, height, x0, y0: 0 };
}

/** A line of text as glyphs; spaces become word gaps. Only the first letter of a word matters. */
function line(text: string, height = 14): BinaryGlyph[] {
  const glyphs: BinaryGlyph[] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === ' ') {
      x += height;
      continue;
    }
    // Unit words are spelled with S/M/H/D stand-ins: the reader only looks at the first.
    const glyph = glyphOf(GLYPH_TEMPLATES.some((t) => t.char === ch) ? ch : 'S', height, x);
    glyphs.push(glyph);
    x += glyph.width + Math.round(height * 0.15);
  }
  return glyphs;
}

describe('panel glyph reading', () => {
  it('recognises every reference character at small sizes', () => {
    for (const t of GLYPH_TEMPLATES) {
      const match = classifyGlyph(glyphOf(t.char, 12, 0), GLYPH_TEMPLATES.map((g) => g.char).join(''));
      expect(match?.char, `char ${t.char}`).toBe(t.char);
    }
  });

  it('reads multi-digit numbers', () => {
    expect(readDigits(line('14'))).toBe(14);
    expect(readDigits(line('10'))).toBe(10);
    expect(readDigits(line('2'))).toBe(2);
  });

  it('reads ages in every unit and combination', () => {
    expect(readAgeSeconds(line('0 SECONDS'))).toBe(0);
    expect(readAgeSeconds(line('45 SECONDS'))).toBe(45);
    expect(readAgeSeconds(line('12 MINUTES'))).toBe(720);
    expect(readAgeSeconds(line('1 HOUR'))).toBe(3600);
    expect(readAgeSeconds(line('3 HOURS 20 MINUTES'))).toBe(12000);
    expect(readAgeSeconds(line('2 DAYS'))).toBe(172800);
  });

  it('refuses an age with a number and no unit', () => {
    expect(readAgeSeconds(line('12'))).toBeNull();
  });

  it('reads condition percentages', () => {
    expect(readPercent(line('100%'))).toBe(1);
    expect(readPercent(line('99%'))).toBe(0.99);
    expect(readPercent(line('7%'))).toBe(0.07);
  });
});

async function loadFixture(name: string, width: number, height: number): Promise<RasterImage> {
  const fsName = 'node:fs';
  const zlibName = 'node:zlib';
  const { readFileSync } = await import(fsName);
  const { gunzipSync } = await import(zlibName);
  const raw: Uint8Array = gunzipSync(readFileSync(new URL(`./fixtures/${name}.rgba.gz`, import.meta.url)));
  return { data: new Uint8ClampedArray(raw), width, height };
}

describe('live panel, real capture', () => {
  it('reads genes, marker number, age and overall condition from one frame', async () => {
    // Desiree at UI scale 0.7: D red, L red, Y green, F neutral, H neutral, 6 on purple,
    // AGE "0 SECONDS", OVERALL "100%".
    const image = await loadFixture('livestock-desiree-panel-ui07', 355, 350);
    const read = readLivestockPanel(image, { readMarkerDigit });
    expect(read).not.toBeNull();
    expect(read!.rows[0].levels).toEqual(['low', 'low', 'high', 'mid', 'mid']);
    expect(read!.rows[0].marker).toEqual({ value: 6, color: 'purple' });
    expect(readPanelConditions(image, read!)).toEqual({ ageSeconds: 0, overall: 1 });
  });
});

describe('age and condition in the sale estimate', () => {
  const row = decodeGeneRow('nnnnn|6v')!;

  it('counts age on from the reading and spots babies', () => {
    const at = 1_000_000;
    const calf = createAnimal({ rows: [row], observed: { ageSeconds: 600, overall: 1, at } });
    expect(currentCondition(calf, at + 60_000).ageSeconds).toBe(660);
    expect(currentCondition(calf, at).isBaby).toBe(true);
    expect(currentCondition(calf, at + 3_600_000).isBaby).toBe(false);
  });

  it('prices from the reading: old and run-down sells for less', () => {
    const at = 1_000_000;
    const fresh = createAnimal({ rows: [row], observed: { ageSeconds: 3600, overall: 1, at } });
    // 48h lifespan at an Ok gene: 36h lived is 75% -> age factor 0.75; 47.5% overall -> 0.7.
    const old = createAnimal({ rows: [row], observed: { ageSeconds: 36 * 3600, overall: 0.475, at } });
    expect(estimateAnimalPrice(fresh, {}, at).price).toBe(50);
    expect(estimateAnimalPrice(old, {}, at).exact).toBeCloseTo(50 * 0.75 * 0.7);
  });

  it('lets explicit what-if values override the reading', () => {
    const at = 1_000_000;
    const old = createAnimal({ rows: [row], observed: { ageSeconds: 36 * 3600, overall: 0.475, at } });
    expect(estimateAnimalPrice(old, { healthState: 1, ageLived: 0 }, at).price).toBe(50);
  });
});
