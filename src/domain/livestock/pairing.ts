import { GeneLevel, LIVESTOCK_GENES, geneMultiplier } from './livestockGenes.ts';
import { LivestockAnimal, LivestockSex } from './animal.ts';
import { BASE_SALE_PRICE, INBRED_GENE_FACTOR, SPECIES_PRICE_FACTOR } from './pricing.ts';

/**
 * Pair suggestions under an ASSUMED inheritance model.
 *
 * Facepunch has not published how livestock genes pass to offspring ("the genes won't
 * behave exactly like plants"). The working assumption is the simplest one: for every gene,
 * the calf or lamb takes the mother's or the father's value with equal chance. Where an
 * animal was recorded with two rows of badges (an earlier panel), each of its rows is one of
 * the values it can pass on.
 *
 * Every number this module produces is therefore a ranking aid, not a prediction. The UI
 * must say so. When real litters disagree with it, this is the one file to change.
 */

export const PAIRING_MODEL_ID = 'parent-coinflip-v1';

export type Relation = 'parent-child' | 'siblings' | 'half-siblings' | 'shared-ancestor';

export interface GeneOutlook {
  /** Average multiplier of the values the offspring could inherit. */
  expectedMultiplier: number;
  /** Chance the inherited value is green. */
  high: number;
  /** Chance the inherited value is red. */
  low: number;
}

export interface PairSuggestion {
  male: LivestockAnimal;
  female: LivestockAnimal;
  /** Expected gene factor of the offspring, inbreeding penalty included. */
  expectedGeneFactor: number;
  /** Expected sale value of a young adult offspring at full health. */
  expectedValue: number;
  /** Chance every gene comes out green. */
  allHighChance: number;
  /** Chance no gene comes out red. */
  noLowChance: number;
  /** Genes where at least one parent carries green. */
  genesWithHighSource: number;
  perGene: GeneOutlook[];
  relation: Relation | null;
  /** True when one or both sexes were never recorded. */
  sexAssumed: boolean;
}

function geneValues(animal: LivestockAnimal, geneIndex: number): Array<GeneLevel | null> {
  return animal.rows.map((row) => row.levels[geneIndex] ?? null);
}

function share(values: Array<GeneLevel | null>, level: GeneLevel): number {
  return values.filter((v) => v === level).length / values.length;
}

export function geneOutlook(a: LivestockAnimal, b: LivestockAnimal, geneIndex: number): GeneOutlook {
  const gene = LIVESTOCK_GENES[geneIndex];
  const fromA = geneValues(a, geneIndex);
  const fromB = geneValues(b, geneIndex);
  // Each parent contributes half; within a parent, each of its rows is equally likely.
  const mean = (values: Array<GeneLevel | null>) =>
    values.reduce((sum, level) => sum + geneMultiplier(gene, level), 0) / values.length;

  return {
    expectedMultiplier: (mean(fromA) + mean(fromB)) / 2,
    high: (share(fromA, 'high') + share(fromB, 'high')) / 2,
    low: (share(fromA, 'low') + share(fromB, 'low')) / 2
  };
}

function ancestors(animal: LivestockAnimal, byId: Map<string, LivestockAnimal>, depth: number): Set<string> {
  const found = new Set<string>();
  let frontier: LivestockAnimal[] = [animal];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: LivestockAnimal[] = [];
    for (const current of frontier) {
      for (const parentId of [current.motherId, current.fatherId]) {
        if (!parentId || found.has(parentId)) continue;
        found.add(parentId);
        const parent = byId.get(parentId);
        if (parent) next.push(parent);
      }
    }
    frontier = next;
  }
  return found;
}

/**
 * How two animals are related, from the parents the player recorded. Unrecorded parents
 * mean "not known to be related", which is not the same as unrelated.
 */
export function relationBetween(
  a: LivestockAnimal,
  b: LivestockAnimal,
  herd: LivestockAnimal[]
): Relation | null {
  if (a.motherId === b.id || a.fatherId === b.id || b.motherId === a.id || b.fatherId === a.id) {
    return 'parent-child';
  }
  const sameMother = !!a.motherId && a.motherId === b.motherId;
  const sameFather = !!a.fatherId && a.fatherId === b.fatherId;
  if (sameMother && sameFather) return 'siblings';
  if (sameMother || sameFather) return 'half-siblings';

  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const ancestorsA = ancestors(a, byId, 3);
  const ancestorsB = ancestors(b, byId, 3);
  if (ancestorsA.has(b.id) || ancestorsB.has(a.id)) return 'shared-ancestor';
  for (const id of ancestorsA) {
    if (ancestorsB.has(id)) return 'shared-ancestor';
  }
  return null;
}

export const RELATION_LABEL: Record<Relation, string> = {
  'parent-child': 'Parent and child',
  siblings: 'Siblings',
  'half-siblings': 'Half-siblings',
  'shared-ancestor': 'Shared ancestor'
};

function canPair(a: LivestockSex, b: LivestockSex): boolean {
  if (a === 'unknown' || b === 'unknown') return true;
  return a !== b;
}

export function evaluatePair(
  male: LivestockAnimal,
  female: LivestockAnimal,
  herd: LivestockAnimal[]
): PairSuggestion {
  const perGene = LIVESTOCK_GENES.map((_, i) => geneOutlook(male, female, i));
  const relation = relationBetween(male, female, herd);
  const meanMultiplier =
    perGene.reduce((sum, outlook) => sum + outlook.expectedMultiplier, 0) / perGene.length;
  const expectedGeneFactor = relation ? meanMultiplier * INBRED_GENE_FACTOR : meanMultiplier;

  return {
    male,
    female,
    expectedGeneFactor,
    expectedValue: BASE_SALE_PRICE * SPECIES_PRICE_FACTOR[male.species] * expectedGeneFactor,
    allHighChance: perGene.reduce((p, outlook) => p * outlook.high, 1),
    noLowChance: perGene.reduce((p, outlook) => p * (1 - outlook.low), 1),
    genesWithHighSource: perGene.filter((outlook) => outlook.high > 0).length,
    perGene,
    relation,
    sexAssumed: male.sex === 'unknown' || female.sex === 'unknown'
  };
}

export type PairSortKey = 'expected' | 'allHigh' | 'noLow';

/**
 * Every eligible pairing in the herd, best first. Same species only; known sexes must
 * differ. Related pairs are kept (the player may want to see them) but carry the
 * inbreeding penalty, so they sink.
 */
export function suggestPairs(
  herd: LivestockAnimal[],
  sortBy: PairSortKey = 'expected'
): PairSuggestion[] {
  const suggestions: PairSuggestion[] = [];

  for (let i = 0; i < herd.length; i++) {
    for (let j = i + 1; j < herd.length; j++) {
      const a = herd[i];
      const b = herd[j];
      if (a.species !== b.species || !canPair(a.sex, b.sex)) continue;
      const aIsMale = a.sex === 'male' || b.sex === 'female';
      suggestions.push(evaluatePair(aIsMale ? a : b, aIsMale ? b : a, herd));
    }
  }

  const primary: Record<PairSortKey, (s: PairSuggestion) => number> = {
    expected: (s) => s.expectedGeneFactor,
    allHigh: (s) => s.allHighChance,
    noLow: (s) => s.noLowChance
  };
  const key = primary[sortBy];

  return suggestions.sort(
    (x, y) =>
      key(y) - key(x) ||
      y.expectedGeneFactor - x.expectedGeneFactor ||
      y.noLowChance - x.noLowChance ||
      y.allHighChance - x.allHighChance ||
      Number(!!x.relation) - Number(!!y.relation)
  );
}
