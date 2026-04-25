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
  inputComment?: string | null;
};

let missingTableLogged = false;

export async function persistAiCharacterSongPickLog(
  input: PersistAiCharacterSongPickLogInput
): Promise<void> {
  if (process.env.AI_CHARACTER_SONG_PICK_LOG_PERSIST === '0') return;
  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin.from('ai_character_song_pick_logs').insert({
    room_id: input.roomId?.trim().slice(0, 120) || null,
    room_title: input.roomTitle?.trim().slice(0, 200) || null,
    picked_video_id: input.pickedVideoId?.trim().slice(0, 32) || null,
    picked_artist_title: input.pickedArtistTitle?.trim().slice(0, 300) || null,
    picked_youtube_title: input.pickedYoutubeTitle?.trim().slice(0, 300) || null,
    pick_query: input.pickQuery?.trim().slice(0, 300) || null,
    pick_reason: input.pickReason?.trim().slice(0, 600) || null,
    confirmation_text: input.confirmationText?.trim().slice(0, 300) || null,
    input_comment: input.inputComment?.trim().slice(0, 1200) || null,
  });

  if (error?.code === '42P01' && !missingTableLogged) {
    missingTableLogged = true;
    console.warn(
      '[ai-character-song-pick-log] テーブル ai_character_song_pick_logs がありません。docs/supabase-ai-character-song-pick-logs-table.md の SQL を実行してください。'
    );
  } else if (error && error.code !== '42P01') {
    console.error('[ai-character-song-pick-log] insert', error.message);
  }
}
