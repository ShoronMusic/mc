/**
 * YouTube Data API `snippet.publishedAt`（RFC3339）から日付だけ取る。
 * プレイリスト取込と同じく先頭 YYYY-MM-DD を優先する。
 */
export function dateOnlyFromYoutubePublishedAt(iso: string | null | undefined): string | null {
  const t = (iso ?? '').trim();
  if (!t) return null;
  const head = t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}
