/**
 * Livestock genetics as Rust displays them (October 2026 livestock update).
 *
 * An animal shows five genes, always in the order D, L, Y, F, H. Each gene comes in three
 * qualities that the game draws as the colour of its badge: red (worse than baseline),
 * dark (baseline) and green (better). Unlike plant genes, the letter never changes -- the
 * quality is the colour.
 *
 * The multipliers and effect values below come from the community infographic dated
 * 2026-09-17. Facepunch labelled the system work in progress at the time, so they are
 * kept in one place to make a balance change a one-line edit.
 */

export const LIVESTOCK_GENES = ['D', 'L', 'Y', 'F', 'H'] as const;
export type LivestockGene = (typeof LIVESTOCK_GENES)[number];

export const GENE_LEVELS = ['low', 'mid', 'high'] as const;
export type GeneLevel = (typeof GENE_LEVELS)[number];

/** Date the gene values were last checked against the game. */
export const LIVESTOCK_DATA_AS_OF = '2026-09-17';

export interface LivestockGeneInfo {
  gene: LivestockGene;
  name: string;
  summary: string;
  multipliers: Record<GeneLevel, number>;
}

export const LIVESTOCK_GENE_INFO: Record<LivestockGene, LivestockGeneInfo> = {
  D: {
    gene: 'D',
    name: 'Dung',
    summary: 'How often the animal gives dung (cows and bulls only)',
    multipliers: { low: 0.6, mid: 1, high: 1.6 }
  },
  L: {
    gene: 'L',
    name: 'Longevity',
    summary: 'How long the animal lives',
    multipliers: { low: 0.65, mid: 1, high: 1.5 }
  },
  Y: {
    gene: 'Y',
    name: 'Yield',
    summary: 'Gather cooldown and how much milk or wool it gives',
    multipliers: { low: 0.6, mid: 1, high: 1.6 }
  },
  F: {
    gene: 'F',
    name: 'Fertility',
    summary: 'Breeding cooldowns and twin chance',
    multipliers: { low: 0.65, mid: 1, high: 1.6 }
  },
  H: {
    gene: 'H',
    name: 'Hardiness',
    summary: 'How hard it is to keep the animal at full health',
    multipliers: { low: 0.7, mid: 1, high: 1.5 }
  }
};

/**
 * Per-level effect values. Times are in seconds unless the name says otherwise.
 * `null` means the effect does not apply to that animal (sheep give no dung).
 */
export const LIVESTOCK_GENE_EFFECTS = {
  Y: {
    gatherCooldownSeconds: { low: 500, mid: 300, high: 187.5 },
    milkPerGather: { low: 1, mid: 1, high: 2 },
    woolPerShear: { low: 6, mid: 10, high: 16 }
  },
  F: {
    maleCooldownSeconds: { low: 923, mid: 600, high: 375 },
    femaleCooldownSeconds: { low: 6120, mid: 3960, high: 2460 },
    twinsChance: { low: 0, mid: 0, high: 0.6 }
  },
  H: {
    /** Fraction of its needs an animal must be at to count as full health. */
    fullHealthThreshold: { low: 0.71, mid: 0.5, high: 0.33 }
  },
  L: {
    lifespanHours: { low: 15.6, mid: 24, high: 36 },
    inbredLifespanHours: { low: 10.9, mid: 16.8, high: 25.2 }
  },
  D: {
    dungIntervalMinutes: { low: 66, mid: 40, high: 25 }
  }
} as const;

export function geneMultiplier(gene: LivestockGene, level: GeneLevel | null): number {
  // An unread badge counts as baseline: it neither flatters nor punishes the animal.
  return LIVESTOCK_GENE_INFO[gene].multipliers[level ?? 'mid'];
}

export const LEVEL_LABEL: Record<GeneLevel, string> = {
  low: 'Red',
  mid: 'Neutral',
  high: 'Green'
};

/** Next level when a badge is clicked in the editor: neutral -> green -> red -> neutral. */
export function cycleLevel(level: GeneLevel | null): GeneLevel {
  if (level === 'mid' || level === null) return 'high';
  if (level === 'high') return 'low';
  return 'mid';
}
