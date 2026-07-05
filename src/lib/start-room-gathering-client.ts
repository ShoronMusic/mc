/** 主催者が終了済みの部屋で会を再開する（POST /api/room-gatherings start） */
export async function startRoomGatheringClient(
  roomId: string,
  title?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/room-gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action: 'start',
        roomId,
        title: title?.trim() || '未設定の部屋',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data?.error?.trim() || '開催の再開に失敗しました。' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: '通信に失敗しました。' };
  }
}
