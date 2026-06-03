/** ログイン参加者: 同一 authUserId の presence が複数端末で重複しないよう1行にまとめる */

export type ParticipantAuthDedupeRow = {
  clientId: string;
  authUserId?: string;
  timestamp: number;
};

export function dedupeParticipantsByAuthUserId<T extends ParticipantAuthDedupeRow>(
  rows: T[],
  preferClientId?: string,
): T[] {
  const prefer = preferClientId?.trim() ?? '';
  const noAuth: T[] = [];
  const byAuth = new Map<string, T>();

  for (const row of rows) {
    const aid = row.authUserId?.trim();
    if (!aid || !/^[0-9a-f-]{36}$/i.test(aid)) {
      noAuth.push(row);
      continue;
    }
    const existing = byAuth.get(aid);
    if (!existing) {
      byAuth.set(aid, row);
      continue;
    }
    byAuth.set(aid, pickParticipantRow(existing, row, prefer));
  }

  return [...noAuth, ...byAuth.values()];
}

function pickParticipantRow<T extends ParticipantAuthDedupeRow>(a: T, b: T, preferClientId: string): T {
  if (preferClientId) {
    if (a.clientId === preferClientId) return a;
    if (b.clientId === preferClientId) return b;
  }
  return a.timestamp <= b.timestamp ? a : b;
}
