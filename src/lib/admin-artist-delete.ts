/**
 * 未使用アーティスト行の削除（参照がある場合は拒否）
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearArtistLookupIndexCache } from '@/lib/song-credits-sync';

export type ArtistDeleteCheck = {
  artistId: string;
  name: string | null;
  songsByArtistId: number;
  songsByMainArtist: number;
  songCredits: number;
  canDelete: boolean;
  blockers: string[];
};

export async function inspectArtistDelete(
  admin: SupabaseClient,
  artistId: string,
): Promise<ArtistDeleteCheck | null> {
  const { data: artist, error } = await admin
    .from('artists')
    .select('id, name, name_ja, name_en')
    .eq('id', artistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!artist) return null;

  const { count: byIdCount, error: e1 } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId);
  if (e1) throw new Error(e1.message);

  const nameKeys = [artist.name, artist.name_ja, artist.name_en]
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean);
  let byMain = 0;
  if (nameKeys.length > 0) {
    const { count, error: e2 } = await admin
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .in('main_artist', nameKeys);
    if (e2) throw new Error(e2.message);
    byMain = count ?? 0;
  }

  let credits = 0;
  const { count: cCount, error: e3 } = await admin
    .from('song_credits')
    .select('song_id', { count: 'exact', head: true })
    .eq('artist_id', artistId);
  if (e3 && e3.code !== '42P01') throw new Error(e3.message);
  credits = cCount ?? 0;

  const blockers: string[] = [];
  if ((byIdCount ?? 0) > 0) blockers.push(`songs.artist_id が ${byIdCount} 件`);
  if (byMain > 0) blockers.push(`songs.main_artist 一致が ${byMain} 件`);

  return {
    artistId,
    name: artist.name ?? null,
    songsByArtistId: byIdCount ?? 0,
    songsByMainArtist: byMain,
    songCredits: credits,
    canDelete: blockers.length === 0,
    blockers,
  };
}

export async function deleteArtistIfUnused(
  admin: SupabaseClient,
  artistId: string,
): Promise<{ ok: true; deletedId: string } | { ok: false; error: string; check?: ArtistDeleteCheck }> {
  const check = await inspectArtistDelete(admin, artistId);
  if (!check) return { ok: false, error: 'アーティストが見つかりません' };
  if (!check.canDelete) {
    return {
      ok: false,
      error: `参照があるため削除できません（${check.blockers.join('、')}）。先に自動マージで正本へ寄せてください。`,
      check,
    };
  }

  if (check.songCredits > 0) {
    const { error: cErr } = await admin.from('song_credits').delete().eq('artist_id', artistId);
    if (cErr) return { ok: false, error: `song_credits 削除失敗: ${cErr.message}`, check };
  }

  await admin
    .from('artists')
    .update({
      music8_artist_id: null,
      music8_artist_slug: null,
      spotify_artist_id: null,
    })
    .eq('id', artistId);

  const { error: dErr } = await admin.from('artists').delete().eq('id', artistId);
  if (dErr) return { ok: false, error: `artists 削除失敗: ${dErr.message}`, check };

  clearArtistLookupIndexCache();
  return { ok: true, deletedId: artistId };
}
