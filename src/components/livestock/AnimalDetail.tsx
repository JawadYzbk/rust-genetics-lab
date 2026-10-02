import React, { useState } from 'react';
import { Box, Button, Chip, Paper, Slider, Stack, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { LivestockAnimal, animalKindLabel, displayName } from '../../domain/livestock/animal.ts';
import { animalStats } from '../../domain/livestock/stats.ts';
import { estimateAnimalPrice } from '../../domain/livestock/pricing.ts';
import { LIVESTOCK_GENE_INFO } from '../../domain/livestock/livestockGenes.ts';
import { LivestockGenePanel, LEVEL_COLOR } from './LivestockGeneBadges.tsx';

const panelSx = { backgroundColor: 'var(--gl-panel-bg)', borderColor: 'var(--gl-border)', borderRadius: '6px' };

export const AnimalDetail: React.FC<{
  animal: LivestockAnimal;
  herd: LivestockAnimal[];
  onEdit: () => void;
}> = ({ animal, herd, onEdit }) => {
  const [health, setHealth] = useState(100);
  const [age, setAge] = useState(25);
  const estimate = estimateAnimalPrice(animal, { healthState: health / 100, ageLived: age / 100 });
  const stats = animalStats(animal);
  const mother = herd.find((a) => a.id === animal.motherId);
  const father = herd.find((a) => a.id === animal.fatherId);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ ...panelSx, p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
          <Box>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 850, color: 'var(--gl-text-primary)' }}>
              {displayName(animal)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
              <Chip size="small" label={animalKindLabel(animal.species, animal.sex)} />
              {animal.inbred && <Chip size="small" color="warning" label="Inbred" />}
              {animal.source === 'scan' && <Chip size="small" variant="outlined" label="Scanned" />}
            </Box>
          </Box>
          <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
            Edit
          </Button>
        </Box>
        <Box sx={{ mt: 2 }}>
          <LivestockGenePanel rows={animal.rows} size="lg" />
        </Box>
        {(mother || father) && (
          <Typography variant="body2" sx={{ color: 'var(--gl-text-secondary)', mt: 1.5 }}>
            {mother && <>Mother: <b>{displayName(mother)}</b>. </>}
            {father && <>Father: <b>{displayName(father)}</b>.</>}
          </Typography>
        )}
        {animal.notes && (
          <Typography variant="body2" sx={{ color: 'var(--gl-text-muted)', mt: 1, whiteSpace: 'pre-wrap' }}>
            {animal.notes}
          </Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ ...panelSx, p: { xs: 1.5, sm: 2 } }}>
        <Typography variant="overline" sx={{ color: 'var(--gl-text-muted)', fontWeight: 900 }}>
          What these genes do
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--gl-text-muted)', display: 'block', mb: 1 }}>
          Read from the top row. Values are community measurements and may change while the system is in development.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', columnGap: 1.5, rowGap: 0.75, alignItems: 'center' }}>
          {stats.map((stat) => (
            <React.Fragment key={stat.label}>
              <Box
                title={LIVESTOCK_GENE_INFO[stat.gene].name}
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: '#fff',
                  backgroundColor: LEVEL_COLOR[stat.level ?? 'mid'],
                  opacity: stat.applies ? 1 : 0.4
                }}
              >
                {stat.gene}
              </Box>
              <Typography variant="body2" sx={{ color: stat.applies ? 'var(--gl-text-secondary)' : 'var(--gl-text-faint)' }}>
                {stat.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  textAlign: 'right',
                  color: !stat.applies
                    ? 'var(--gl-text-faint)'
                    : stat.level === 'high'
                      ? 'var(--gl-success)'
                      : stat.level === 'low'
                        ? 'var(--gl-error)'
                        : 'var(--gl-text-primary)'
                }}
              >
                {stat.applies ? stat.value : '-'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--gl-text-faint)', fontFamily: 'monospace', textAlign: 'right' }}>
                base {stat.baseline}
              </Typography>
            </React.Fragment>
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ ...panelSx, p: { xs: 1.5, sm: 2 } }}>
        <Typography variant="overline" sx={{ color: 'var(--gl-text-muted)', fontWeight: 900 }}>
          Stablehand sale estimate
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography sx={{ fontSize: 32, fontWeight: 900, fontFamily: 'monospace', color: 'var(--gl-primary)' }}>
            ~{estimate.price}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--gl-text-secondary)' }}>
            scrap (range 3-78)
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'var(--gl-text-muted)', display: 'block' }}>
          50 x type {estimate.factors.type} x genes {estimate.factors.genes.toFixed(2)} x health{' '}
          {estimate.factors.health.toFixed(2)} x age {estimate.factors.age.toFixed(2)}. The game randomises the actual offer.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'var(--gl-text-secondary)' }}>
              Health / needs: {health}%
            </Typography>
            <Slider size="small" value={health} min={0} max={100} onChange={(_, v) => setHealth(v as number)} aria-label="Health" />
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'var(--gl-text-secondary)' }}>
              Lifespan lived: {age}%
            </Typography>
            <Slider size="small" value={age} min={0} max={100} onChange={(_, v) => setAge(v as number)} aria-label="Age" />
          </Box>
        </Box>
        <Typography variant="caption" sx={{ color: 'var(--gl-text-muted)' }}>
          To sell, the animal must be grown, not pregnant, alive, and led by you to the Stablehand.
        </Typography>
      </Paper>
    </Stack>
  );
};
