export type MyListClientPostPayload = {
  url?: string;
  videoId?: string;
  title?: string | null;
  artist?: string | null;
  note?: string | null;
  source?: 'manual_url' | 'song_history' | 'favorites' | 'extension' | 'import';
};

export type MyListClientPostResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: string; status: number };

/** ブラウザから POST /api/my-list（部屋チャット・マイページ共通） */
export async function postMyListItemClient(
  payload: MyListClientPostPayload,
): Promise<MyListClientPostResult> {
  const res = await fetch('/api/my-list', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { duplicate?: boolean; error?: string };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data?.error === 'string' ? data.error : 'マイリストへの追加に失敗しました。',
    };
  }
  return { ok: true, duplicate: Boolean(data.duplicate) };
}
