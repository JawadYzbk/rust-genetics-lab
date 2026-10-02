import { GeneLevel, LIVESTOCK_GENE_EFFECTS } from './livestockGenes.ts';
import { LivestockAnimal } from './animal.ts';

/**
 * What an animal's genes mean in play, read from its top row (see `pricing.ts` for why the
 * top row). Each entry is ready to show: a label, the value for this animal, and the
 * baseline it compares against.
 */

export interface AnimalStat {
  gene: 'D' | 'L' | 'Y' | 'F' | 'H';
  label: string;
  value: string;
  baseline: string;
  level: GeneLevel | null;
  /** Lower is better for cooldowns and intervals, higher for amounts. */
  better: 'higher' | 'lower';
  /** False when the stat does not apply to this animal at all. */
  applies: boolean;
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds * 10) / 10}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function hours(value: number): string {
  return `${Math.round(value * 10) / 10}h`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function animalStats(animal: LivestockAnimal): AnimalStat[] {
  const [d, l, y, f, h] = animal.rows[0].levels;
  const level = (value: GeneLevel | null): GeneLevel => value ?? 'mid';
  const E = LIVESTOCK_GENE_EFFECTS;
  const isCattle = animal.species === 'cattle';
  const isMale = animal.sex === 'male';
  const isFemale = animal.sex === 'female';
  const stats: AnimalStat[] = [];

  stats.push({
    gene: 'Y',
    label: 'Gather cooldown',
    value: formatDuration(E.Y.gatherCooldownSeconds[level(y)]),
    baseline: formatDuration(E.Y.gatherCooldownSeconds.mid),
    level: y,
    better: 'lower',
    applies: true
  });
  if (isCattle) {
    stats.push({
      gene: 'Y',
      label: 'Milk per gather',
      value: String(E.Y.milkPerGather[level(y)]),
      baseline: String(E.Y.milkPerGather.mid),
      level: y,
      better: 'higher',
      applies: !isMale
    });
  } else {
    stats.push({
      gene: 'Y',
      label: 'Wool per shear',
      value: String(E.Y.woolPerShear[level(y)]),
      baseline: String(E.Y.woolPerShear.mid),
      level: y,
      better: 'higher',
      applies: true
    });
  }

  if (!isFemale) {
    stats.push({
      gene: 'F',
      label: 'Male breeding cooldown',
      value: formatDuration(E.F.maleCooldownSeconds[level(f)]),
      baseline: formatDuration(E.F.maleCooldownSeconds.mid),
      level: f,
      better: 'lower',
      applies: true
    });
  }
  if (!isMale) {
    stats.push({
      gene: 'F',
      label: 'Female breeding cooldown',
      value: formatDuration(E.F.femaleCooldownSeconds[level(f)]),
      baseline: formatDuration(E.F.femaleCooldownSeconds.mid),
      level: f,
      better: 'lower',
      applies: true
    });
    stats.push({
      gene: 'F',
      label: 'Twins chance',
      value: percent(E.F.twinsChance[level(f)]),
      baseline: percent(E.F.twinsChance.mid),
      level: f,
      better: 'higher',
      applies: true
    });
  }

  stats.push({
    gene: 'H',
    label: 'Needs state for full health',
    value: percent(E.H.fullHealthThreshold[level(h)]),
    baseline: percent(E.H.fullHealthThreshold.mid),
    level: h,
    better: 'lower',
    applies: true
  });

  const lifespan = animal.inbred ? E.L.inbredLifespanHours : E.L.lifespanHours;
  stats.push({
    gene: 'L',
    label: animal.inbred ? 'Lifespan (inbred)' : 'Lifespan',
    value: hours(lifespan[level(l)]),
    baseline: hours(E.L.lifespanHours.mid),
    level: l,
    better: 'higher',
    applies: true
  });

  stats.push({
    gene: 'D',
    label: 'Dung interval',
    value: isCattle ? `${E.D.dungIntervalMinutes[level(d)]}m` : 'None',
    baseline: `${E.D.dungIntervalMinutes.mid}m`,
    level: d,
    better: 'lower',
    applies: isCattle
  });

  return stats;
}
