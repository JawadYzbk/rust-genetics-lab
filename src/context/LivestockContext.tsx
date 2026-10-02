import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StorageService } from '../services/storageService.ts';
import { sanitizeHerd } from '../domain/livestock/herdCodec.ts';
import {
  LivestockAnimal,
  LivestockGeneRow,
  ObservedCondition,
  LivestockSex,
  LivestockSpecies,
  createAnimal,
  displayName,
  encodeAnimalGenes,
  suggestAnimalName
} from '../domain/livestock/animal.ts';
import {
  IDLE_LIVESTOCK_SCAN_STATE,
  LivestockScanSession,
  LivestockScanState
} from '../services/livestock/livestockScanSession.ts';
import { StableRead } from '../services/livestock/livestockReadStabilizer.ts';
import { useNotification } from './NotificationContext.tsx';

/** A scanned animal held back because its genes match one already in the herd. */
export interface PendingScan {
  read: StableRead;
  observed: ObservedCondition | null;
  matches: LivestockAnimal[];
}

/** What to do with a pending scan: a new animal, a fresh reading of a known one, or nothing. */
export type PendingChoice = { kind: 'add' } | { kind: 'update'; id: string } | { kind: 'skip' };

interface LivestockContextValue {
  herd: LivestockAnimal[];
  addAnimal: (animal: LivestockAnimal) => void;
  updateAnimal: (id: string, patch: Partial<LivestockAnimal>) => void;
  removeAnimal: (id: string) => void;
  replaceHerd: (herd: LivestockAnimal[]) => void;
  clearHerd: () => void;

  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  /** What a scanned animal is added as; the panel itself does not say. */
  scanSpecies: LivestockSpecies;
  scanSex: LivestockSex;
  setScanKind: (species: LivestockSpecies, sex: LivestockSex) => void;

  scan: LivestockScanState;
  startDesktopScan: () => Promise<void>;
  startCameraScan: (video: HTMLVideoElement) => Promise<void>;
  stopScan: () => void;
  pending: PendingScan | null;
  resolvePending: (choice: PendingChoice) => void;
}

const LivestockContext = createContext<LivestockContextValue | null>(null);

function rowsFromRead(rows: LivestockGeneRow[]): LivestockGeneRow[] {
  return rows.map((row) => ({ levels: [...row.levels], marker: { ...row.marker } }));
}

export const LivestockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { notifySuccess, notifyError } = useNotification();
  const [herd, setHerd] = useState<LivestockAnimal[]>(() => sanitizeHerd(StorageService.getLivestockHerdRaw()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanSpecies, setScanSpecies] = useState<LivestockSpecies>('cattle');
  const [scanSex, setScanSex] = useState<LivestockSex>('female');
  const [scan, setScan] = useState<LivestockScanState>(IDLE_LIVESTOCK_SCAN_STATE);
  const [pending, setPending] = useState<PendingScan | null>(null);

  // The session outlives renders; refs give its callbacks the current herd and settings.
  const herdRef = useRef(herd);
  const kindRef = useRef({ species: scanSpecies, sex: scanSex });
  herdRef.current = herd;
  kindRef.current = { species: scanSpecies, sex: scanSex };

  useEffect(() => {
    StorageService.saveLivestockHerdRaw(herd);
  }, [herd]);

  const addAnimal = useCallback((animal: LivestockAnimal) => {
    setHerd((current) => [...current, animal]);
  }, []);

  const updateAnimal = useCallback((id: string, patch: Partial<LivestockAnimal>) => {
    setHerd((current) => current.map((a) => (a.id === id ? { ...a, ...patch, id } : a)));
  }, []);

  const removeAnimal = useCallback((id: string) => {
    setHerd((current) =>
      current
        .filter((a) => a.id !== id)
        // Children keep existing; they just lose the link to a parent that is gone.
        .map((a) => ({
          ...a,
          motherId: a.motherId === id ? undefined : a.motherId,
          fatherId: a.fatherId === id ? undefined : a.fatherId
        }))
    );
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const replaceHerd = useCallback((next: LivestockAnimal[]) => {
    setHerd(next);
    setSelectedId(null);
  }, []);

  const clearHerd = useCallback(() => {
    const previous = herdRef.current;
    setHerd([]);
    setSelectedId(null);
    notifySuccess(`Removed ${previous.length} animal${previous.length === 1 ? '' : 's'}`, {
      label: 'Undo',
      onClick: () => setHerd(previous)
    });
  }, [notifySuccess]);

  const setScanKind = useCallback((species: LivestockSpecies, sex: LivestockSex) => {
    setScanSpecies(species);
    setScanSex(sex);
  }, []);

  const addScanned = useCallback(
    (read: StableRead, observed: ObservedCondition | null) => {
      const { species, sex } = kindRef.current;
      const animal = createAnimal({
        species,
        sex,
        name: suggestAnimalName(species, sex, herdRef.current),
        rows: rowsFromRead(read.rows),
        observed: observed ?? undefined,
        source: 'scan'
      });
      setHerd((current) => [...current, animal]);
      setSelectedId(animal.id);
      notifySuccess(`Added ${displayName(animal)}`, {
        label: 'Undo',
        onClick: () => setHerd((current) => current.filter((a) => a.id !== animal.id))
      });
    },
    [notifySuccess]
  );

  const sessionRef = useRef<LivestockScanSession | null>(null);
  const getSession = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = new LivestockScanSession((event) => {
        if (event.type === 'state') {
          setScan(event.state);
        } else if (event.type === 'confirmed') {
          const matches = herdRef.current.filter((a) => encodeAnimalGenes(a.rows) === event.read.key);
          // Wild animals often share a genotype, so a match is a question, not a refusal.
          if (matches.length > 0) setPending({ read: event.read, observed: event.observed, matches });
          else addScanned(event.read, event.observed);
        }
      });
    }
    return sessionRef.current;
  }, [addScanned]);

  useEffect(() => () => sessionRef.current?.stop(), []);

  const startDesktopScan = useCallback(async () => {
    const session = getSession();
    await session.startDesktop();
    const state = session.getState();
    if (state.status === 'error' && state.error) notifyError(state.error);
  }, [getSession, notifyError]);

  const startCameraScan = useCallback(
    async (video: HTMLVideoElement) => {
      const session = getSession();
      await session.startCamera(video);
      const state = session.getState();
      if (state.status === 'error' && state.error) notifyError(state.error);
    },
    [getSession, notifyError]
  );

  const stopScan = useCallback(() => {
    sessionRef.current?.stop();
    setPending(null);
  }, []);

  const resolvePending = useCallback(
    (choice: PendingChoice) => {
      if (pending) {
        if (choice.kind === 'add') addScanned(pending.read, pending.observed);
        if (choice.kind === 'update' && pending.observed) {
          const observed = pending.observed;
          setHerd((current) => current.map((a) => (a.id === choice.id ? { ...a, observed } : a)));
          setSelectedId(choice.id);
        }
      }
      setPending(null);
    },
    [pending, addScanned]
  );

  const value = useMemo<LivestockContextValue>(
    () => ({
      herd,
      addAnimal,
      updateAnimal,
      removeAnimal,
      replaceHerd,
      clearHerd,
      selectedId,
      setSelectedId,
      scanSpecies,
      scanSex,
      setScanKind,
      scan,
      startDesktopScan,
      startCameraScan,
      stopScan,
      pending,
      resolvePending
    }),
    [
      herd,
      addAnimal,
      updateAnimal,
      removeAnimal,
      replaceHerd,
      clearHerd,
      selectedId,
      scanSpecies,
      scanSex,
      setScanKind,
      scan,
      startDesktopScan,
      startCameraScan,
      stopScan,
      pending,
      resolvePending
    ]
  );

  return <LivestockContext.Provider value={value}>{children}</LivestockContext.Provider>;
};

export function useLivestock(): LivestockContextValue {
  const context = useContext(LivestockContext);
  if (!context) throw new Error('useLivestock must be used inside LivestockProvider');
  return context;
}
