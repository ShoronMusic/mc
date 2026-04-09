/**
 * 自動趣向要約用: ログインユーザーに紐づく複数ソースをテキスト化（Gemini 投入前）。
 * テーブル未作成・空は静かにスキップ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_SIGNAL_CHARS = 12_000;

function pushSection(out: string[], title: string, lines: string[]) {
  const body = lines.filter(Boolean).join('\n').trim();
  if (body) {
    out.push(`### ${title}\n${body}`);
  }
}

/**
 * @returns 空なら要約不要（十分なシグナルなし）
 */
export async function gatherUserTasteSignalsForAutoProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const sections: string[] = [];

  const { data: chatRows, error: chatErr } = await supabase
    .from('room_chat_log')
    .select('body, created_at')
    .eq('user_id', userId)
    .eq('message_type', 'user')
    .order('created_at', { ascending: false })
    .limit(50);
  if (!chatErr && chatRows?.length) {
    const lines = (chatRows as { body?: string }[])
      .map((r) => (typeof r.body === 'string' ? r.body.replace(/\s+/g, ' ').trim() : ''))
      .filter(Boolean)
      .slice(0, 45)
      .map((b) => (b.length > 220 ? `${b.slice(0, 219)}…` : b));
    pushSection(sections, '過去のチャット発言（新しい順・抜粋）', lines);
  }

  const { data: histRows, error: histErr } = await supabase
    .from('user_song_history')
    .select('title, artist, posted_at')
    .eq('user_id', userId)
    .order('posted_at', { ascending: false })
    .limit(40);
  if (!histErr && histRows?.length) {
    const lines = (histRows as { title?: string; artist?: string }[]).map((r) => {
      const t = typeof r.title === 'string' ? r.title.trim() : '';
      const a = typeof r.artist === 'string' ? r.artist.trim() : '';
      if (t && a) return `- ${a} — ${t}`;
      return t ? `- ${t}` : a ? `- ${a}` : '';
    });
    pushSection(sections, '選曲履歴（自分が貼った曲）', lines.filter(Boolean));
  }

  const { data: favRows, error: favErr } = await supabase
    .from('user_favorites')
    .select('title, artist_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(35);
  if (!favErr && favRows?.length) {
    const lines = (favRows as { title?: string; artist_name?: string }[]).map((r) => {
      const t = typeof r.title === 'string' ? r.title.trim() : '';
      const a = typeof r.artist_name === 'string' ? r.artist_name.trim() : '';
      if (t && a) return `- ${a} — ${t}`;
      return t ? `- ${t}` : a ? `- ${a}` : '';
    });
    pushSection(sections, 'お気に入り', lines.filter(Boolean));
  }

  const { data: listRows, error: listErr } = await supabase
    .from('user_my_list_items')
    .select('title, artist, note, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(35);
  if (!listErr && listRows?.length) {
    const lines = (listRows as { title?: string; artist?: string; note?: string }[]).map((r) => {
      const t = typeof r.title === 'string' ? r.title.trim() : '';
      const a = typeof r.artist === 'string' ? r.artist.trim() : '';
      const n = typeof r.note === 'string' ? r.note.trim() : '';
      let s = '';
      if (t && a) s = `- ${a} — ${t}`;
      else if (t) s = `- ${t}`;
      else if (a) s = `- ${a}`;
      if (n && s) s += `（メモ: ${n.length > 80 ? `${n.slice(0, 79)}…` : n}）`;
      return s;
    });
    pushSection(sections, 'マイリスト', lines.filter(Boolean));
  }

  let text = sections.join('\n\n').trim();
  if (text.length > MAX_SIGNAL_CHARS) {
    text = text.slice(0, MAX_SIGNAL_CHARS - 1) + '…';
  }
  return text;
}
