export function planToolHint(opts: {
  tool: string;
  pendingAttachMode: boolean;
  selectedRoomId: string | null;
  planWallTool?: boolean;
  pendingCorner?: boolean;
  selectedVertexIndex?: number | null;
}): string | null {
  if (opts.tool === 'door' || opts.tool === 'window' || opts.tool === 'passage') {
    return `Tap a wall to place a ${opts.tool}`;
  }
  if (opts.pendingCorner || opts.tool === 'corner') {
    return opts.selectedRoomId || opts.pendingCorner ? 'Drag along a wall to place a corner.' : 'Tap a room, then Corner';
  }
  if (opts.selectedVertexIndex != null) {
    return 'Drag the new corner.';
  }
  if (opts.pendingAttachMode) {
    return opts.selectedRoomId ? 'Tap a side of the room to add another' : 'Tap a room to add onto';
  }
  if (opts.planWallTool) {
    return 'Tap a wall to edit its length.';
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
