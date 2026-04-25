import { createAdminClient } from '@/lib/supabase/admin';

type PersistAiCharacterSongPickLogInput = {
  roomId?: string | null;
  roomTitle?: string | null;
  pickedVideoId?: string | null;
  pickedArtistTitle?: string | null;
  pickedYoutubeTitle?: string | null;
  pickQuery?: string | null;
  pickReason?: string | null;
  confirmationText?: string | null;
};

let missingTableLogged = false;

/** 新規行の id。失敗時は null */
export async function persistAiCharacterSongPickLog(
  input: PersistAiCharacterSongPickLogInput
): Promise<string | null> {
  if (process.env.AI_CHARACTER_SONG_PICK_LOG_PERSIST === '0') return null;
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('ai_character_song_pick_logs')
    .insert({
      room_id: input.roomId?.trim().slice(0, 120) || null,
      room_title: input.roomTitle?.trim().slice(0, 200) || null,
      picked_video_id: input.pickedVideoId?.trim().slice(0, 32) || null,
      picked_artist_title: input.pickedArtistTitle?.trim().slice(0, 300) || null,
      picked_youtube_title: input.pickedYoutubeTitle?.trim().slice(0, 300) || null,
      pick_query: input.pickQuery?.trim().slice(0, 300) || null,
      pick_reason: input.pickReason?.trim().slice(0, 600) || null,
      confirmation_text: input.confirmationText?.trim().slice(0, 300) || null,
    })
    .select('id')
    .single();

  if (error?.code === '42P01' && !missingTableLogged) {
    missingTableLogged = true;
    console.warn(
      '[ai-character-song-pick-log] テーブル ai_character_song_pick_logs がありません。docs/supabase-ai-character-song-pick-logs-table.md の SQL を実行してください。'
    );
  } else if (error && error.code !== '42P01') {
    console.error('[ai-character-song-pick-log] insert', error.message);
  }
  const id = typeof data?.id === 'string' ? data.id : null;
  return id;
}

/** DB 列 input_comment に、AIキャラの選曲後チャット本文を保存（上書き可） */
export async function updateAiCharacterSongPickLogUtterance(params: {
  pickLogId: string;
  utterance: string;
  pickedVideoId?: string | null;
}): Promise<boolean> {
  if (process.env.AI_CHARACTER_SONG_PICK_LOG_PERSIST === '0') return false;
  const admin = createAdminClient();
  if (!admin) return false;
  const id = params.pickLogId.trim();
  if (!id) return false;
  const text = params.utterance.trim().slice(0, 2000);
  if (!text) return false;
  const vid = params.pickedVideoId?.trim() ?? '';
  let q = admin.from('ai_character_song_pick_logs').update({ input_comment: text }).eq('id', id);
  if (vid) q = q.eq('picked_video_id', vid.slice(0, 32));
  const { error } = await q;
  if (error) {
    console.error('[ai-character-song-pick-log] update utterance', error.message);
    return false;
  }
  return true;
}
