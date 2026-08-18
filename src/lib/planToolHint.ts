export function planToolHint(opts: {
  tool: string;
  pendingAttachMode: boolean;
  selectedRoomId: string | null;
}): string | null {
  if (opts.tool === 'door' || opts.tool === 'window' || opts.tool === 'passage') {
    return `Tap a wall to place a ${opts.tool}`;
  }
  if (opts.tool === 'corner') {
    return opts.selectedRoomId ? 'Tap a wall to add a corner' : 'Tap a room, then Corner';
  }
  if (opts.pendingAttachMode) {
    return opts.selectedRoomId ? 'Tap a side of the room to add another' : 'Tap a room to add onto';
  }
  return null;
}

/** Decide how Add behaves at plan level when rooms already exist. */
export function addRoomPlanAction(opts: {
  selectedRoomId: string | null;
  onlyRoomId: string | null;
  pendingAttachMode: boolean;
}): { selectId: string | null; attach: boolean; prompt: boolean } {
  if (opts.pendingAttachMode) {
    return { selectId: opts.selectedRoomId, attach: false, prompt: false };
  }
  const selectId = opts.selectedRoomId ?? opts.onlyRoomId;
  return { selectId, attach: true, prompt: !selectId };
}
