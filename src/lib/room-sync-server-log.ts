/** Vercel / ローカル API の運用調査用。`MC_ROOM_SYNC_DEBUG=1` のときのみ出力 */
export function roomSyncServerLog(event: string, detail?: Record<string, unknown>): void {
  if (process.env.MC_ROOM_SYNC_DEBUG !== '1') return;
  const t = new Date().toISOString();
  console.log(`[mc-room-sync:server ${t}] ${event}`, detail ?? {});
}
