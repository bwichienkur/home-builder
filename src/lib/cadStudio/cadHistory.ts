import type { CadPlate } from './types';

const MAX_STACK = 60;

export type CadHistoryState = {
  past: CadPlate[];
  present: CadPlate;
  future: CadPlate[];
};

export function createCadHistory(present: CadPlate): CadHistoryState {
  return { past: [], present, future: [] };
}

export function pushCadHistory(state: CadHistoryState, next: CadPlate): CadHistoryState {
  if (next === state.present) return state;
  const past = [...state.past, state.present].slice(-MAX_STACK);
  return { past, present: next, future: [] };
}

export function undoCadHistory(state: CadHistoryState): CadHistoryState {
  if (!state.past.length) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, MAX_STACK),
  };
}

export function redoCadHistory(state: CadHistoryState): CadHistoryState {
  if (!state.future.length) return state;
  const next = state.future[0]!;
  return {
    past: [...state.past, state.present].slice(-MAX_STACK),
    present: next,
    future: state.future.slice(1),
  };
}

export function replaceCadPresent(state: CadHistoryState, present: CadPlate): CadHistoryState {
  return { ...state, present, past: [], future: [] };
}

/** Update present without touching undo/redo stacks (live drag preview). */
export function previewCadPresent(state: CadHistoryState, present: CadPlate): CadHistoryState {
  if (present === state.present) return state;
  return { ...state, present };
}

/**
 * Commit a plate after a preview gesture: push `baseline` (pre-gesture) onto past
 * and keep `present` as the final plate. When baseline is omitted, behaves like pushCadHistory.
 */
export function commitCadPresent(
  state: CadHistoryState,
  present: CadPlate,
  baseline?: CadPlate | null,
): CadHistoryState {
  if (baseline) {
    if (present === baseline) return { ...state, present: baseline };
    const past = [...state.past, baseline].slice(-MAX_STACK);
    return { past, present, future: [] };
  }
  return pushCadHistory(state, present);
}
