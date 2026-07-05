/** Ably clientId は再接続で変わる。選曲者表示・キュー適用用の identity キャッシュ */

export type PublisherIdentitySnapshot = {
  displayName: string;
  authUserId?: string;
};

export type ParticipantIdentityRow = {
  clientId: string;
  displayName: string;
  authUserId?: string;
};

export function rememberPublisherIdentity(
  map: Map<string, PublisherIdentitySnapshot>,
  clientId: string,
  displayName: string,
  authUserId?: string,
): void {
  const id = clientId.trim();
  const name = displayName.trim() || 'ゲスト';
  if (!id) return;
  const aid = authUserId?.trim();
  map.set(id, {
    displayName: name,
    ...(aid && /^[0-9a-f-]{36}$/i.test(aid) ? { authUserId: aid } : {}),
  });
}

export function syncPublisherIdentityMapFromParticipants(
  map: Map<string, PublisherIdentitySnapshot>,
  rows: ParticipantIdentityRow[],
): void {
  for (const row of rows) {
    rememberPublisherIdentity(map, row.clientId, row.displayName, row.authUserId);
  }
}

/**
 * 在室 participants に無い clientId（再接続前の publisher）でも表示名を返す。
 */
export function resolvePublisherDisplayName(
  clientId: string,
  map: Map<string, PublisherIdentitySnapshot>,
  participants: ParticipantIdentityRow[],
  options?: { myClientId?: string; myDisplayName?: string },
): string {
  const id = clientId.trim();
  if (!id) return '参加者';
  const live = participants.find((p) => p.clientId === id);
  if (live?.displayName?.trim()) return live.displayName.trim();
  const cached = map.get(id);
  if (cached?.displayName?.trim()) return cached.displayName.trim();
  const myId = options?.myClientId?.trim() ?? '';
  if (myId && id === myId) {
    const mine = options?.myDisplayName?.trim();
    if (mine) return mine;
  }
  const aid = cached?.authUserId?.trim();
  if (aid) {
    const byAuth = participants.find((p) => p.authUserId?.trim() === aid);
    if (byAuth?.displayName?.trim()) return byAuth.displayName.trim();
  }
  return 'ゲスト';
}

/** changeVideo / sync / キュー適用: clientId を在室 ID に寄せ、表示名を確定してキャッシュする */
export function resolveAndRememberSongPoster(params: {
  map: Map<string, PublisherIdentitySnapshot>;
  publisherClientId: string;
  publisherAuthUserId?: string;
  publisherDisplayName?: string;
  participants: ParticipantIdentityRow[];
  myClientId?: string;
  myDisplayName?: string;
}): { clientId: string; displayName: string } {
  const resolvedClientId = resolveActivePublisherClientId(
    params.publisherClientId,
    params.publisherAuthUserId,
    params.participants,
  );
  const hint = params.publisherDisplayName?.trim();
  const displayName = hint
    ? hint
    : resolvePublisherDisplayName(resolvedClientId, params.map, params.participants, {
        myClientId: params.myClientId,
        myDisplayName: params.myDisplayName,
      });
  rememberPublisherIdentity(
    params.map,
    resolvedClientId,
    displayName,
    params.publisherAuthUserId,
  );
  return { clientId: resolvedClientId, displayName };
}

/** キュー適用時: 古い clientId を在室の同一 authUserId の clientId に差し替える */
export function resolveActivePublisherClientId(
  publisherClientId: string,
  publisherAuthUserId: string | undefined,
  participants: Array<{ clientId: string; authUserId?: string }>,
): string {
  const pubId = publisherClientId.trim();
  if (!pubId) return pubId;
  if (participants.some((p) => p.clientId === pubId)) return pubId;
  const aid = publisherAuthUserId?.trim();
  if (aid && /^[0-9a-f-]{36}$/i.test(aid)) {
    const live = participants.find((p) => p.authUserId?.trim() === aid);
    if (live?.clientId) return live.clientId;
  }
  return pubId;
}
