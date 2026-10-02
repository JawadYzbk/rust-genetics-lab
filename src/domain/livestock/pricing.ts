import { LivestockGene, LIVESTOCK_GENES, geneMultiplier } from './livestockGenes.ts';
import { LivestockAnimal, LivestockGeneRow, LivestockSpecies } from './animal.ts';

/**
 * Stablehand sale price, from the community-measured formula:
 *
 *   price = 50 * type * genes * health * age
 *
 * - type: sheep 0.6, cattle 1
 * - genes: mean of the five gene multipliers, x0.7 when the animal is inbred
 * - health: 0.40 below 15% state, 0.70 at 47.5%, 1.00 from 80% up
 * - age: 1.00 up to half its lifespan, 0.75 at 75%, 0.50 at the end
 *
 * The anchor points are measured, the stretches between them are interpolated linearly, and
 * the game itself randomises the offer, so the result is an estimate, not a quote.
 */

export const BASE_SALE_PRICE = 50;
export const INBRED_GENE_FACTOR = 0.7;
export const SPECIES_PRICE_FACTOR: Record<LivestockSpecies, number> = { cattle: 1, sheep: 0.6 };

export interface SalePriceInput {
  species: LivestockSpecies;
  row: LivestockGeneRow;
  inbred: boolean;
  /** Needs/health state, 0..1. Defaults to full. */
  healthState?: number;
  /** Fraction of its lifespan already lived, 0..1. Defaults to a young adult. */
  ageLived?: number;
}

export interface SalePriceEstimate {
  price: number;
  /** Unrounded value, for comparisons. */
  exact: number;
  factors: { type: number; genes: number; health: number; age: number };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function interpolate(x: number, points: Array<[number, number]>): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

export function healthFactor(healthState: number): number {
  return interpolate(clamp01(healthState), [
    [0.15, 0.4],
    [0.475, 0.7],
    [0.8, 1]
  ]);
}

export function ageFactor(ageLived: number): number {
  return interpolate(clamp01(ageLived), [
    [0.5, 1],
    [0.75, 0.75],
    [1, 0.5]
  ]);
}

export function geneFactor(row: LivestockGeneRow, inbred: boolean): number {
  let sum = 0;
  LIVESTOCK_GENES.forEach((gene: LivestockGene, i) => {
    sum += geneMultiplier(gene, row.levels[i] ?? null);
  });
  const mean = sum / LIVESTOCK_GENES.length;
  return inbred ? mean * INBRED_GENE_FACTOR : mean;
}

export function estimateSalePrice(input: SalePriceInput): SalePriceEstimate {
  const factors = {
    type: SPECIES_PRICE_FACTOR[input.species],
    genes: geneFactor(input.row, input.inbred),
    health: healthFactor(input.healthState ?? 1),
    age: ageFactor(input.ageLived ?? 0)
  };
  const exact = BASE_SALE_PRICE * factors.type * factors.genes * factors.health * factors.age;
  return { price: Math.round(exact), exact, factors };
}

/**
 * Estimate from the animal's top row, which is the one this app treats as the animal's own
 * genes until the meaning of the second row is known.
 */
export function estimateAnimalPrice(
  animal: LivestockAnimal,
  conditions: { healthState?: number; ageLived?: number } = {}
): SalePriceEstimate {
  return estimateSalePrice({
    species: animal.species,
    row: animal.rows[0],
    inbred: animal.inbred,
    ...conditions
  });
}
