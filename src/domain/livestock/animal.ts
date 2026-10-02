import { GeneLevel, LIVESTOCK_GENES } from './livestockGenes.ts';

export type LivestockSpecies = 'cattle' | 'sheep';
export type LivestockSex = 'male' | 'female' | 'unknown';

/**
 * Colour of the sixth badge, which carries a number. Its meaning is not documented yet
 * (captures show 0 on pink, 4 on teal, 6 on purple, 14 on blue), so it is stored exactly as
 * read and never interpreted.
 */
export type MarkerColor = 'pink' | 'blue' | 'purple' | 'teal' | 'red' | 'green' | 'grey' | 'unknown';

export interface LivestockGeneRow {
  /** One level per gene in D, L, Y, F, H order; `null` where the badge could not be read. */
  levels: Array<GeneLevel | null>;
  marker: { value: number | null; color: MarkerColor };
}

export interface LivestockAnimal {
  id: string;
  name: string;
  species: LivestockSpecies;
  sex: LivestockSex;
  /**
   * Badge rows exactly as the game draws them. The live panel shows one row; an earlier
   * panel showed a large row over a small one, kept as `rows[1]`. `rows[0]` is always the
   * animal's own genes.
   */
  rows: LivestockGeneRow[];
  /** Set by the player; the game's own inbreeding indicator is not decoded yet. */
  inbred: boolean;
  motherId?: string;
  fatherId?: string;
  notes?: string;
  source: 'scan' | 'manual';
  createdAt: number;
}

export const SPECIES_LABEL: Record<LivestockSpecies, string> = {
  cattle: 'Cattle',
  sheep: 'Sheep'
};

export function animalKindLabel(species: LivestockSpecies, sex: LivestockSex): string {
  if (species === 'cattle') {
    if (sex === 'male') return 'Bull';
    if (sex === 'female') return 'Cow';
    return 'Cattle';
  }
  if (sex === 'male') return 'Ram';
  if (sex === 'female') return 'Ewe';
  return 'Sheep';
}

export function emptyGeneRow(): LivestockGeneRow {
  return {
    levels: LIVESTOCK_GENES.map(() => 'mid' as GeneLevel),
    marker: { value: null, color: 'unknown' }
  };
}

let idCounter = 0;
export function newAnimalId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `animal-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createAnimal(partial: Partial<LivestockAnimal> = {}): LivestockAnimal {
  return {
    id: partial.id ?? newAnimalId(),
    name: partial.name ?? '',
    species: partial.species ?? 'cattle',
    sex: partial.sex ?? 'female',
    rows: partial.rows && partial.rows.length > 0 ? partial.rows.slice(0, 2) : [emptyGeneRow()],
    inbred: partial.inbred ?? false,
    motherId: partial.motherId,
    fatherId: partial.fatherId,
    notes: partial.notes,
    source: partial.source ?? 'manual',
    createdAt: partial.createdAt ?? Date.now()
  };
}

const LEVEL_CODE: Record<GeneLevel, string> = { low: 'r', mid: 'n', high: 'g' };
const CODE_LEVEL: Record<string, GeneLevel> = { r: 'low', n: 'mid', g: 'high' };
const MARKER_CODE: Record<MarkerColor, string> = {
  pink: 'p',
  blue: 'b',
  purple: 'v',
  teal: 't',
  red: 'r',
  green: 'g',
  grey: 'n',
  unknown: '?'
};
const CODE_MARKER: Record<string, MarkerColor> = {
  p: 'pink',
  b: 'blue',
  v: 'purple',
  t: 'teal',
  r: 'red',
  g: 'green',
  n: 'grey',
  '?': 'unknown'
};

/**
 * Compact, stable text form of a row: one letter per gene (`r` red, `n` neutral, `g` green,
 * `?` unread), then the marker's value and colour. `rrgnn|0p` reads "D red, L red, Y green,
 * F neutral, H neutral, marker 0 pink". Used for de-duplicating scans and for export.
 */
export function encodeGeneRow(row: LivestockGeneRow): string {
  const genes = row.levels.map((level) => (level ? LEVEL_CODE[level] : '?')).join('');
  const value = row.marker.value === null ? '?' : String(row.marker.value);
  return `${genes}|${value}${MARKER_CODE[row.marker.color]}`;
}

export function decodeGeneRow(code: string): LivestockGeneRow | null {
  const match = /^([rng?]{5})\|(\?|\d{1,3})([pbvtrgn?])$/i.exec(code.trim());
  if (!match) return null;
  const levels = match[1]
    .toLowerCase()
    .split('')
    .map((ch) => (ch === '?' ? null : CODE_LEVEL[ch]));
  return {
    levels,
    marker: {
      value: match[2] === '?' ? null : Number(match[2]),
      color: CODE_MARKER[match[3].toLowerCase()]
    }
  };
}

/** Every row; identical for two reads of the same animal's panel. */
export function encodeAnimalGenes(rows: LivestockGeneRow[]): string {
  return rows.map(encodeGeneRow).join('/');
}

export function countLevels(row: LivestockGeneRow): Record<GeneLevel | 'unknown', number> {
  const counts = { low: 0, mid: 0, high: 0, unknown: 0 };
  for (const level of row.levels) {
    if (level) counts[level]++;
    else counts.unknown++;
  }
  return counts;
}

/** Default display name, e.g. "Cow 3", numbered within its kind. */
export function suggestAnimalName(
  species: LivestockSpecies,
  sex: LivestockSex,
  herd: LivestockAnimal[]
): string {
  const kind = animalKindLabel(species, sex);
  const used = new Set(herd.map((a) => a.name));
  let n = herd.filter((a) => a.species === species && a.sex === sex).length + 1;
  while (used.has(`${kind} ${n}`)) n++;
  return `${kind} ${n}`;
}

export function displayName(animal: LivestockAnimal): string {
  return animal.name.trim() || animalKindLabel(animal.species, animal.sex);
}
