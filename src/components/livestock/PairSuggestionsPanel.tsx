import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { LivestockAnimal, LivestockSpecies, displayName } from '../../domain/livestock/animal.ts';
import { PairSortKey, RELATION_LABEL, suggestPairs } from '../../domain/livestock/pairing.ts';
import { LIVESTOCK_GENES } from '../../domain/livestock/livestockGenes.ts';
import { LivestockGenePanel } from './LivestockGeneBadges.tsx';

const panelSx = { backgroundColor: 'var(--gl-panel-bg)', borderColor: 'var(--gl-border)', borderRadius: '6px' };

function pct(value: number): string {
  if (value === 0) return '0%';
  if (value < 0.001) return '<0.1%';
  return `${Math.round(value * 1000) / 10}%`;
}

const SORT_LABEL: Record<PairSortKey, string> = {
  expected: 'Best average genes',
  noLow: 'Fewest red genes',
  allHigh: 'Best chance of all green'
};

export const PairSuggestionsPanel: React.FC<{
  herd: LivestockAnimal[];
  onSelect: (id: string) => void;
}> = ({ herd, onSelect }) => {
  const [species, setSpecies] = useState<LivestockSpecies>(() =>
    herd.some((a) => a.species === 'cattle') || !herd.some((a) => a.species === 'sheep') ? 'cattle' : 'sheep'
  );
  const [sortBy, setSortBy] = useState<PairSortKey>('expected');

  const pairs = useMemo(
    () => suggestPairs(herd.filter((a) => a.species === species), sortBy).slice(0, 25),
    [herd, species, sortBy]
  );

  return (
    <Stack spacing={1.5}>
      <Alert severity="warning" variant="outlined">
        <b>Best guess, not verified.</b> Facepunch has not published how livestock genes are inherited. These
        rankings assume each gene comes from the mother or the father at even odds. Treat them as a shortlist,
        and record parents so inbreeding is flagged.
      </Alert>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={species}
          onChange={(_, value: LivestockSpecies | null) => value && setSpecies(value)}
          aria-label="Species to pair"
        >
          <ToggleButton value="cattle">Cattle</ToggleButton>
          <ToggleButton value="sheep">Sheep</ToggleButton>
        </ToggleButtonGroup>
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <InputLabel id="pair-sort">Rank by</InputLabel>
          <Select labelId="pair-sort" label="Rank by" value={sortBy} onChange={(e) => setSortBy(e.target.value as PairSortKey)}>
            {(Object.keys(SORT_LABEL) as PairSortKey[]).map((key) => (
              <MenuItem key={key} value={key}>
                {SORT_LABEL[key]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {pairs.length === 0 && (
        <Typography variant="body2" sx={{ color: 'var(--gl-text-muted)' }}>
          Add at least one {species === 'cattle' ? 'bull and one cow' : 'ram and one ewe'} to see pairings.
        </Typography>
      )}

      {pairs.map((pair, index) => (
        <Paper
          key={`${pair.male.id}-${pair.female.id}`}
          variant="outlined"
          sx={{ ...panelSx, p: 1.5, borderLeft: `4px solid ${pair.relation ? 'var(--gl-warning)' : index === 0 ? 'var(--gl-success)' : 'var(--gl-border)'}` }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <Typography sx={{ fontWeight: 800, color: 'var(--gl-text-primary)' }}>
              #{index + 1}{' '}
              <Box component="button" type="button" onClick={() => onSelect(pair.male.id)} sx={linkSx}>
                {displayName(pair.male)}
              </Box>{' '}
              x{' '}
              <Box component="button" type="button" onClick={() => onSelect(pair.female.id)} sx={linkSx}>
                {displayName(pair.female)}
              </Box>
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {pair.relation && <Chip size="small" color="warning" label={`Inbreeding risk: ${RELATION_LABEL[pair.relation]}`} />}
              {pair.sexAssumed && <Chip size="small" variant="outlined" label="Sex not recorded" />}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
            <LivestockGenePanel rows={pair.male.rows} size="sm" />
            <LivestockGenePanel rows={pair.female.rows} size="sm" />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1, mt: 1.25 }}>
            <Metric label="Avg gene value" value={`x${pair.expectedGeneFactor.toFixed(2)}`} />
            <Metric label="Est. offspring value" value={`~${Math.round(pair.expectedValue)} scrap`} />
            <Metric label="No red genes" value={pct(pair.noLowChance)} />
            <Metric label="All green" value={pct(pair.allHighChance)} />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {LIVESTOCK_GENES.map((gene, i) => (
              <Typography key={gene} variant="caption" sx={{ fontFamily: 'monospace', color: 'var(--gl-text-muted)' }}>
                {gene}: {pct(pair.perGene[i].high)} green
              </Typography>
            ))}
          </Box>
        </Paper>
      ))}
    </Stack>
  );
};

const linkSx = {
  background: 'none',
  border: 'none',
  p: 0,
  font: 'inherit',
  color: 'var(--gl-primary)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 3
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" sx={{ color: 'var(--gl-text-muted)', display: 'block', fontWeight: 700 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--gl-text-primary)' }}>
      {value}
    </Typography>
  </Box>
);
