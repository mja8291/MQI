import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { runBudget } from '@mqi/shared';
import type { BudgetCampusesResult, BudgetResult, BudgetState, Scenario } from '@mqi/shared';
import { api, errorText } from './api';

interface Data {
  state: BudgetState | null;
  error: string;
  reload(): Promise<void>;
  /** Replaces one scenario in the loaded state after a save. */
  putScenario(s: Scenario): void;
  campuses(cycleId: string): BudgetCampusesResult | null;
  campusError(cycleId: string): string;
  loadCampuses(cycleId: string, force?: boolean): Promise<void>;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BudgetState | null>(null);
  const [error, setError] = useState('');
  const [byCycle, setByCycle] = useState<Record<string, BudgetCampusesResult>>({});
  const [cycleErrors, setCycleErrors] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      setState(await api<BudgetState>('budget.state'));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadCampuses = useCallback(async (cycleId: string, force = false) => {
    if (!force && byCycle[cycleId]) return;
    try {
      const r = await api<BudgetCampusesResult>('budget.campuses', { cycleId });
      setByCycle((m) => ({ ...m, [cycleId]: r }));
      setCycleErrors((m) => ({ ...m, [cycleId]: '' }));
    } catch (e) {
      setCycleErrors((m) => ({ ...m, [cycleId]: errorText(e) }));
    }
  }, [byCycle]);

  const value: Data = {
    state,
    error,
    reload,
    putScenario(s) {
      setState((st) => (st ? { ...st, scenarios: st.scenarios.some((x) => x.id === s.id) ? st.scenarios.map((x) => (x.id === s.id ? s : x)) : [...st.scenarios, s] } : st));
    },
    campuses: (id) => byCycle[id] ?? null,
    campusError: (id) => cycleErrors[id] ?? '',
    loadCampuses,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData outside DataProvider');
  return d;
}

/** The campuses of a cycle, loaded once. */
export function useCycleCampuses(cycleId: string | undefined): { data: BudgetCampusesResult | null; error: string; refresh(): void } {
  const d = useData();
  const { loadCampuses } = d;
  useEffect(() => {
    if (cycleId) void loadCampuses(cycleId);
  }, [cycleId, loadCampuses]);
  return {
    data: cycleId ? d.campuses(cycleId) : null,
    error: cycleId ? d.campusError(cycleId) : '',
    refresh: () => cycleId && void loadCampuses(cycleId, true),
  };
}

/** A scenario's budget, recomputed whenever its config or the campuses change. */
export function useBudget(scenario: Scenario | undefined, campuses: BudgetCampusesResult | null, zones: BudgetState['regionZones'] | undefined): BudgetResult | null {
  return useMemo(() => (scenario && campuses ? runBudget(campuses.campuses, scenario.config, zones ?? []) : null), [scenario, campuses, zones]);
}
