import React from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useLivestock } from '../../context/LivestockContext.tsx';
import { LivestockSex, LivestockSpecies } from '../../domain/livestock/animal.ts';

const KINDS: Array<{ value: string; label: string; species: LivestockSpecies; sex: LivestockSex }> = [
  { value: 'cattle:female', label: 'Cow', species: 'cattle', sex: 'female' },
  { value: 'cattle:male', label: 'Bull', species: 'cattle', sex: 'male' },
  { value: 'sheep:female', label: 'Ewe', species: 'sheep', sex: 'female' },
  { value: 'sheep:male', label: 'Ram', species: 'sheep', sex: 'male' },
  { value: 'cattle:unknown', label: 'Cattle (sex unknown)', species: 'cattle', sex: 'unknown' },
  { value: 'sheep:unknown', label: 'Sheep (sex unknown)', species: 'sheep', sex: 'unknown' }
];

/** The gene panel does not say what the animal is, so scans are filed under this choice. */
export const ScanKindSelect: React.FC = () => {
  const { scanSpecies, scanSex, setScanKind } = useLivestock();
  return (
    <FormControl size="small" sx={{ minWidth: 150 }}>
      <InputLabel id="livestock-scan-kind">Add scans as</InputLabel>
      <Select
        labelId="livestock-scan-kind"
        label="Add scans as"
        value={`${scanSpecies}:${scanSex}`}
        onChange={(e) => {
          const kind = KINDS.find((k) => k.value === e.target.value);
          if (kind) setScanKind(kind.species, kind.sex);
        }}
      >
        {KINDS.map((kind) => (
          <MenuItem key={kind.value} value={kind.value}>
            {kind.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
