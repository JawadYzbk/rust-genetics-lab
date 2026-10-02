import { describe, it, expect } from 'vitest';
import {
  createAnimal,
  decodeGeneRow,
  encodeAnimalGenes,
  encodeGeneRow,
  LivestockGeneRow,
  suggestAnimalName
} from '../domain/livestock/animal.ts';
import { GeneLevel, cycleLevel } from '../domain/livestock/livestockGenes.ts';
import { ageFactor, estimateSalePrice, healthFactor } from '../domain/livestock/pricing.ts';
import { animalStats } from '../domain/livestock/stats.ts';
import { evaluatePair, relationBetween, suggestPairs } from '../domain/livestock/pairing.ts';

function row(levels: string, marker: LivestockGeneRow['marker'] = { value: 0, color: 'pink' }): LivestockGeneRow {
  const map: Record<string, GeneLevel | null> = { r: 'low', n: 'mid', g: 'high', '?': null };
  return { levels: levels.split('').map((ch) => map[ch]), marker };
}

describe('livestock gene rows', () => {
  it('round-trips the compact row code', () => {
    const original = row('rng?g', { value: 12, color: 'blue' });
    const code = encodeGeneRow(original);
    expect(code).toBe('rng?g|12b');
    expect(decodeGeneRow(code)).toEqual(original);
  });

  it('rejects malformed codes', () => {
    expect(decodeGeneRow('rng|0p')).toBeNull();
    expect(decodeGeneRow('rngxx|0p')).toBeNull();
    expect(decodeGeneRow('rnggg-0p')).toBeNull();
  });

  it('encodes both rows so two reads of one panel compare equal', () => {
    const a = encodeAnimalGenes([row('rrrrr'), row('rrrrr', { value: 1, color: 'blue' })]);
    const b = encodeAnimalGenes([row('rrrrr'), row('rrrrr', { value: 1, color: 'blue' })]);
    expect(a).toBe(b);
    expect(a).toBe('rrrrr|0p/rrrrr|1b');
  });

  it('cycles badge levels neutral -> green -> red -> neutral', () => {
    expect(cycleLevel('mid')).toBe('high');
    expect(cycleLevel('high')).toBe('low');
    expect(cycleLevel('low')).toBe('mid');
    expect(cycleLevel(null)).toBe('high');
  });

  it('numbers default names within a kind', () => {
    const herd = [
      createAnimal({ species: 'cattle', sex: 'female', name: 'Cow 1' }),
      createAnimal({ species: 'cattle', sex: 'male', name: 'Bull 1' })
    ];
    expect(suggestAnimalName('cattle', 'female', herd)).toBe('Cow 2');
    expect(suggestAnimalName('sheep', 'male', herd)).toBe('Ram 1');
  });
});

describe('livestock sale price', () => {
  it('reaches the measured maximum of 78 for an all-green young cow', () => {
    const estimate = estimateSalePrice({ species: 'cattle', row: row('ggggg'), inbred: false });
    expect(estimate.price).toBe(78);
  });

  it('reaches the measured minimum of 3 for the worst possible sheep', () => {
    const estimate = estimateSalePrice({
      species: 'sheep',
      row: row('rrrrr'),
      inbred: true,
      healthState: 0.1,
      ageLived: 1
    });
    expect(estimate.price).toBe(3);
  });

  it('prices a baseline cow at 50', () => {
    expect(estimateSalePrice({ species: 'cattle', row: row('nnnnn'), inbred: false }).price).toBe(50);
  });

  it('hits the health and age anchors exactly and interpolates between them', () => {
    expect(healthFactor(0.1)).toBeCloseTo(0.4);
    expect(healthFactor(0.475)).toBeCloseTo(0.7);
    expect(healthFactor(0.9)).toBeCloseTo(1);
    expect(healthFactor(0.6375)).toBeCloseTo(0.85);
    expect(ageFactor(0.3)).toBe(1);
    expect(ageFactor(0.75)).toBeCloseTo(0.75);
    expect(ageFactor(1)).toBeCloseTo(0.5);
  });

  it('treats an unread badge as baseline', () => {
    const known = estimateSalePrice({ species: 'cattle', row: row('nnnnn'), inbred: false });
    const unread = estimateSalePrice({ species: 'cattle', row: row('?????'), inbred: false });
    expect(unread.exact).toBe(known.exact);
  });
});

describe('livestock stats', () => {
  it('reads a cow\'s effects from its top row', () => {
    const cow = createAnimal({ species: 'cattle', sex: 'female', rows: [row('ggrgn'), row('rrrrr')] });
    const stats = animalStats(cow);
    const byLabel = Object.fromEntries(stats.map((s) => [s.label, s.value]));
    expect(byLabel['Dung interval']).toBe('25m');
    expect(byLabel['Lifespan']).toBe('36h');
    expect(byLabel['Gather cooldown']).toBe('8m');
    expect(byLabel['Milk per gather']).toBe('1');
    expect(byLabel['Female breeding cooldown']).toBe('41m');
    expect(byLabel['Twins chance']).toBe('60%');
    expect(byLabel['Male breeding cooldown']).toBeUndefined();
  });

  it('gives sheep wool instead of milk and no dung', () => {
    const ram = createAnimal({ species: 'sheep', sex: 'male', rows: [row('nnnnn'), row('nnnnn')] });
    const stats = animalStats(ram);
    expect(stats.find((s) => s.label === 'Wool per shear')?.value).toBe('10');
    expect(stats.find((s) => s.label === 'Dung interval')?.applies).toBe(false);
  });

  it('uses the shorter inbred lifespan', () => {
    const cow = createAnimal({ inbred: true, rows: [row('nnnnn'), row('nnnnn')] });
    expect(animalStats(cow).find((s) => s.gene === 'L')?.value).toBe('16.8h');
  });
});

describe('livestock pairing (assumed model)', () => {
  const bull = createAnimal({ id: 'bull', species: 'cattle', sex: 'male', rows: [row('ggggg'), row('ggggg')] });
  const cow = createAnimal({ id: 'cow', species: 'cattle', sex: 'female', rows: [row('ggggg'), row('rrrrr')] });

  it('weighs each parent equally, and each of a parent\'s rows equally', () => {
    // bull: all green on both rows. cow: green on one row, red on the other.
    const pair = evaluatePair(bull, cow, [bull, cow]);
    expect(pair.perGene[0].high).toBeCloseTo(0.75);
    expect(pair.perGene[0].low).toBeCloseTo(0.25);
    expect(pair.allHighChance).toBeCloseTo(0.75 ** 5);
    expect(pair.noLowChance).toBeCloseTo(0.75 ** 5);
    expect(pair.relation).toBeNull();
  });

  it('pairs single-row animals, as the live panel shows them', () => {
    const singleBull = createAnimal({ id: 'sb', species: 'cattle', sex: 'male', rows: [row('ggggg')] });
    const singleCow = createAnimal({ id: 'sc', species: 'cattle', sex: 'female', rows: [row('rrrrr')] });
    const pair = evaluatePair(singleBull, singleCow, [singleBull, singleCow]);
    expect(pair.perGene[2].high).toBeCloseTo(0.5);
    expect(pair.expectedGeneFactor).toBeCloseTo((1.56 + 0.64) / 2);
  });

  it('only pairs opposite sexes of the same species', () => {
    const ewe = createAnimal({ id: 'ewe', species: 'sheep', sex: 'female' });
    const cow2 = createAnimal({ id: 'cow2', species: 'cattle', sex: 'female' });
    const pairs = suggestPairs([bull, cow, ewe, cow2]);
    expect(pairs).toHaveLength(2);
    for (const pair of pairs) {
      expect(pair.male.id).toBe('bull');
      expect(pair.female.species).toBe('cattle');
    }
  });

  it('ranks the stronger cow first', () => {
    const weakCow = createAnimal({ id: 'weak', species: 'cattle', sex: 'female', rows: [row('rrrrr'), row('rrrrr')] });
    const pairs = suggestPairs([bull, weakCow, cow]);
    expect(pairs[0].female.id).toBe('cow');
  });

  it('flags recorded relatives and applies the inbreeding penalty', () => {
    const calf = createAnimal({ id: 'calf', species: 'cattle', sex: 'female', motherId: 'cow', fatherId: 'bull', rows: [row('ggggg'), row('ggggg')] });
    const herd = [bull, cow, calf];
    expect(relationBetween(bull, calf, herd)).toBe('parent-child');
    const sibling = createAnimal({ id: 'sib', species: 'cattle', sex: 'male', motherId: 'cow', fatherId: 'bull' });
    expect(relationBetween(sibling, calf, [...herd, sibling])).toBe('siblings');

    const inbred = evaluatePair(bull, calf, herd);
    expect(inbred.relation).toBe('parent-child');
    expect(inbred.expectedGeneFactor).toBeCloseTo(1.56 * 0.7);
  });

  it('finds a shared grandparent', () => {
    const grandma = createAnimal({ id: 'gm', species: 'cattle', sex: 'female' });
    const mumA = createAnimal({ id: 'ma', species: 'cattle', sex: 'female', motherId: 'gm' });
    const mumB = createAnimal({ id: 'mb', species: 'cattle', sex: 'female', motherId: 'gm' });
    const a = createAnimal({ id: 'a', species: 'cattle', sex: 'male', motherId: 'ma' });
    const b = createAnimal({ id: 'b', species: 'cattle', sex: 'female', motherId: 'mb' });
    expect(relationBetween(a, b, [grandma, mumA, mumB, a, b])).toBe('shared-ancestor');
  });
});
