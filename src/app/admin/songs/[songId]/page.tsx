import { createClient } from '@/lib/supabase/server';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminSongMasterDeletePanel } from '@/components/admin/AdminSongMasterDeletePanel';
import { AdminSongMusic8RefreshPanel } from '@/components/admin/AdminSongMusic8RefreshPanel';
import { AdminSongMusic8JsonImportPanel } from '@/components/admin/AdminSongMusic8JsonImportPanel';
import { AdminSongBasicInfoEditPanel } from '@/components/admin/AdminSongBasicInfoEditPanel';

interface SongDetailPageProps {
  params: { songId: string };
}

interface SongRow {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  play_count: number | null;
  original_release_date?: string | null;
  music8_song_data?: Record<string, unknown> | null;
  created_at: string;
  // Music8 詳細メタ
  genres?: string[] | null;
  vocal?: string | null;
  primary_artist_name_ja?: string | null;
  structured_style?: string | null;
  music8_song_id?: number | null;
  music8_artist_slug?: string | null;
  music8_song_slug?: string | null;
  music8_video_id?: string | null;
  // Spotify
  spotify_track_id?: string | null;
  spotify_release_date?: string | null;
  spotify_name?: string | null;
  spotify_artists?: string | null;
  spotify_images?: string | null;
  spotify_popularity?: number | null;
  // artists FK
  artist_id?: string | null;
}

interface SongVideoRow {
  video_id: string;
  variant: string | null;
  performance_id: string | null;
  youtube_published_at?: string | null;
  created_at: string;
}

interface SongCommentaryRow {
  video_id: string;
  body: string;
  created_at: string;
}

interface SongTidbitRow {
  id: string;
  song_id: string | null;
  video_id: string | null;
  body: string;
  created_at: string;
  source: string;
  is_active: boolean;
}

interface UserSongPickCountRow {
  userId: string;
  count: number;
}

interface CommentFeedbackRow {
  video_id: string | null;
  ai_message_id: string;
  body: string;
  source: string;
  is_upvote: boolean | null;
  is_duplicate?: boolean | null;
  is_dubious?: boolean | null;
  is_ambiguous?: boolean | null;
  free_comment?: string | null;
  created_at?: string;
  id?: string;
  user_id?: string | null;
}

interface AggregatedFeedback {
  videoId: string | null;
  aiMessageId: string;
  body: string;
  source: string;
  goodCount: number;
  badCount: number;
}

function isSongRow(value: unknown): value is SongRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.created_at === 'string' &&
    ('display_title' in row) &&
    ('main_artist' in row) &&
    ('song_title' in row) &&
    ('style' in row) &&
    ('play_count' in row)
  );
}

/** ラベル＋値の1行表示（null のときは「—」、href があれば別ウインドリンク） */
function MetaRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  href?: string | null;
}) {
  const textClass = `break-all ${mono ? 'font-mono text-blue-300' : 'text-gray-200'} ${!value ? 'text-gray-600' : ''}`;
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-gray-500">{label}：</span>
      {value && href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${textClass} hover:underline`}>
          {value}
        </a>
      ) : (
        <span className={textClass}>{value ?? '—'}</span>
      )}
    </div>
  );
}

/** モーダルからの詳細フィードバック（チェックまたは自由コメントあり） */
function isDetailFeedbackRow(row: CommentFeedbackRow): boolean {
  if (row.is_duplicate === true || row.is_dubious === true || row.is_ambiguous === true) return true;
  const fc = typeof row.free_comment === 'string' ? row.free_comment.trim() : '';
  return fc.length > 0;
}

export default async function SongDetailPage({ params }: SongDetailPageProps) {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>DBが利用できません。</p>
      </main>
    );
  }

  const { data, error } = await supabase
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, style, play_count, original_release_date, music8_song_data, created_at,' +
      'genres, vocal, primary_artist_name_ja, structured_style,' +
      'music8_song_id, music8_artist_slug, music8_song_slug, music8_video_id,' +
      'spotify_track_id, spotify_release_date, spotify_name, spotify_artists, spotify_images, spotify_popularity,' +
      'artist_id',
    )
    .eq('id', params.songId)
    .maybeSingle();

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>曲情報の取得に失敗しました: {error.message}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>指定された曲が見つかりませんでした。</p>
      </main>
    );
  }

  if (!isSongRow(data)) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>曲データ形式が不正です。管理者に連絡してください。</p>
      </main>
    );
  }

  const song = data;

  // Spotify アーティスト ID を取得（優先順位: artists テーブル → music8_song_data スナップショット）
  let spotifyArtistId: string | null = null;
  if (song.artist_id) {
    try {
      const { data: artistData } = await supabase
        .from('artists')
        .select('spotify_artist_id')
        .eq('id', song.artist_id)
        .maybeSingle();
      const raw = (artistData as { spotify_artist_id?: string | null } | null)?.spotify_artist_id;
      if (typeof raw === 'string' && raw.trim()) spotifyArtistId = raw.trim();
    } catch {
      // artists テーブルがなくても続行
    }
  }
  // フォールバック: music8_song_data スナップショットの artist_spotify_id
  if (!spotifyArtistId && song.music8_song_data && typeof song.music8_song_data === 'object') {
    const snap = song.music8_song_data as Record<string, unknown>;
    const fromSnap = snap.artist_spotify_id;
    if (typeof fromSnap === 'string' && fromSnap.trim()) spotifyArtistId = fromSnap.trim();
  }

  // song_videos の取得
  let videos: SongVideoRow[] = [];
  try {
    const { data: videoData, error: videoError } = await supabase
      .from('song_videos')
      .select('video_id, variant, performance_id, youtube_published_at, created_at')
      .eq('song_id', song.id)
      .order('created_at', { ascending: true });
    if (videoError && videoError.code !== '42P01') {
      console.error('[admin/song-detail] song_videos', videoError.code, videoError.message);
    }
    videos = (videoData as SongVideoRow[]) ?? [];
  } catch (e) {
    console.error('[admin/song-detail] song_videos exception', e);
  }

  // song_commentary を video_id ごとに取得（基本情報コメント）
  let commentaryMap = new Map<string, SongCommentaryRow>();
  if (videos.length > 0) {
    const ids = Array.from(new Set(videos.map((v) => v.video_id))).filter(Boolean);
    if (ids.length > 0) {
      try {
        const { data: commData, error: commError } = await supabase
          .from('song_commentary')
          .select('video_id, body, created_at')
          .in('video_id', ids);
        if (commError && commError.code !== '42P01') {
          console.error('[admin/song-detail] song_commentary', commError.code, commError.message);
        }
        if (Array.isArray(commData)) {
          commentaryMap = new Map(
            (commData as SongCommentaryRow[]).map((c) => [c.video_id, c]),
          );
        }
      } catch (e) {
        console.error('[admin/song-detail] song_commentary exception', e);
      }
    }
  }

  // song_tidbits（豆知識ライブラリ）
  let tidbits: SongTidbitRow[] = [];
  try {
    const { data: tidbitData, error: tidbitError } = await supabase
      .from('song_tidbits')
      .select('id, song_id, video_id, body, created_at, source, is_active')
      .eq('song_id', song.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (tidbitError && tidbitError.code !== '42P01') {
      console.error('[admin/song-detail] song_tidbits', tidbitError.code, tidbitError.message);
    }
    tidbits = (tidbitData as SongTidbitRow[]) ?? [];
  } catch (e) {
    console.error('[admin/song-detail] song_tidbits exception', e);
  }

  // 当該曲（song_videos.video_id 群）に対するログインユーザー別選曲回数
  let userPickCounts: UserSongPickCountRow[] = [];
  let userPickCountTruncated = false;
  if (videos.length > 0) {
    const videoIds = Array.from(new Set(videos.map((v) => v.video_id).filter(Boolean)));
    if (videoIds.length > 0) {
      const PAGE = 1000;
      const MAX_SCAN = 12000;
      const byUser = new Map<string, number>();
      let scanned = 0;
      for (let offset = 0; ; offset += PAGE) {
        const { data: playRows, error: playErr } = await supabase
          .from('room_playback_history')
          .select('user_id')
          .in('video_id', videoIds)
          .not('user_id', 'is', null)
          .range(offset, offset + PAGE - 1);
        if (playErr) {
          if (playErr.code !== '42P01') {
            console.error('[admin/song-detail] room_playback_history user-count', playErr.code, playErr.message);
          }
          break;
        }
        const rows = (playRows ?? []) as { user_id?: string | null }[];
        for (const r of rows) {
          const uid = typeof r.user_id === 'string' ? r.user_id.trim() : '';
          if (!uid) continue;
          byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
        }
        scanned += rows.length;
        if (rows.length < PAGE) break;
        if (scanned >= MAX_SCAN) {
          userPickCountTruncated = true;
          break;
        }
      }
      userPickCounts = [...byUser.entries()]
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId));
    }
  }

  // comment_feedback（AIコメント評価）: song_id 単位で取得して集約
  let feedback: AggregatedFeedback[] = [];
  let detailFeedbackRows: CommentFeedbackRow[] = [];
  try {
    const { data: fbData, error: fbError } = await supabase
      .from('comment_feedback')
      .select(
        'id, created_at, user_id, video_id, ai_message_id, body, source, is_upvote, is_duplicate, is_dubious, is_ambiguous, free_comment',
      )
      .eq('song_id', song.id)
      .order('created_at', { ascending: false });
    if (fbError && fbError.code !== '42P01') {
      console.error('[admin/song-detail] comment_feedback', fbError.code, fbError.message);
    }
    if (Array.isArray(fbData)) {
      const rows = fbData as CommentFeedbackRow[];
      detailFeedbackRows = rows.filter(isDetailFeedbackRow);

      const map = new Map<string, AggregatedFeedback>();
      rows.forEach((row) => {
        if (!row.ai_message_id) return;
        const key = `${row.video_id ?? ''}__${row.ai_message_id}`;
        const existing = map.get(key);
        const good = row.is_upvote === true ? 1 : 0;
        const bad =
          row.is_upvote === false && !isDetailFeedbackRow(row) ? 1 : 0;
        if (existing) {
          existing.goodCount += good;
          existing.badCount += bad;
        } else {
          map.set(key, {
            videoId: row.video_id ?? null,
            aiMessageId: row.ai_message_id,
            body: row.body,
            source: row.source ?? 'unknown',
            goodCount: good,
            badCount: bad,
          });
        }
      });
      feedback = Array.from(map.values()).sort((a, b) => (b.goodCount - b.badCount) || (a.badCount - b.badCount));
    }
  } catch (e) {
    console.error('[admin/song-detail] comment_feedback exception', e);
  }

  return (
    <main className="mx-auto max-w-4xl bg-gray-950 p-4 text-gray-100">
      <AdminMenuBar />
      <h1 className="mb-4 text-xl font-semibold">管理者: 曲詳細</h1>

      {/* 曲メイン情報 */}
      <section className="mb-4 space-y-2 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="text-sm font-semibold text-gray-200">基本情報（songs）</h2>
        <p>
          <span className="text-gray-500">ID：</span>
          {song.id}
        </p>
        <p>
          <span className="text-gray-500">display_title：</span>
          {song.display_title || '(なし)'}
        </p>
        <p>
          <span className="text-gray-500">メインアーティスト：</span>
          {song.main_artist || '(なし)'}
        </p>
        <p>
          <span className="text-gray-500">曲タイトル：</span>
          {song.song_title || '(なし)'}
        </p>
        <p>
          <span className="text-gray-500">スタイル：</span>
          {song.style || '(未設定)'}
        </p>
        <p>
          <span className="text-gray-500">play_count：</span>
          {song.play_count ?? 0}
        </p>
        <p>
          <span className="text-gray-500">original_release_date（原盤）：</span>
          {song.original_release_date ?? '—'}
        </p>
        {song.music8_song_data && typeof song.music8_song_data === 'object' ? (
          <details className="rounded border border-gray-800 bg-gray-950/80 p-2">
            <summary className="cursor-pointer text-gray-400">music8_song_data（Music8 スナップショット）</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-[11px] text-gray-300">
              {JSON.stringify(song.music8_song_data, null, 2)}
            </pre>
          </details>
        ) : (
          <p>
            <span className="text-gray-500">music8_song_data：</span>
            <span className="text-gray-400">—</span>
          </p>
        )}

        {/* Music8 詳細メタ */}
        <div className="rounded border border-gray-800 bg-gray-950/40 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-400">Music8 詳細メタ</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 text-xs">
            <MetaRow label="music8_song_id" value={song.music8_song_id != null ? String(song.music8_song_id) : null} />
            <MetaRow label="music8_artist_slug" value={song.music8_artist_slug ?? null} mono />
            <MetaRow label="music8_song_slug" value={song.music8_song_slug ?? null} mono />
            <MetaRow label="music8_video_id (canonical)" value={song.music8_video_id ?? null} mono />
            <MetaRow label="genres" value={Array.isArray(song.genres) && song.genres.length > 0 ? song.genres.join(', ') : null} />
            <MetaRow label="vocal" value={song.vocal ?? null} />
            <MetaRow label="primary_artist_name_ja" value={song.primary_artist_name_ja ?? null} />
            <MetaRow label="structured_style" value={song.structured_style ?? null} />
            <MetaRow
              label="spotify_track_id"
              value={song.spotify_track_id ?? null}
              mono
              href={song.spotify_track_id ? `https://open.spotify.com/track/${song.spotify_track_id}` : null}
            />
            <MetaRow
              label="spotify_artists01_id"
              value={spotifyArtistId}
              mono
              href={spotifyArtistId ? `https://open.spotify.com/artist/${spotifyArtistId}` : null}
            />
            <MetaRow label="spotify_release_date" value={song.spotify_release_date ?? null} />
            <MetaRow label="spotify_name" value={song.spotify_name ?? null} />
            <MetaRow label="spotify_artists" value={song.spotify_artists ?? null} />
            <MetaRow label="spotify_popularity" value={song.spotify_popularity != null ? String(song.spotify_popularity) : null} />
          </div>
          {(song.spotify_images ?? '').trim() ? (
            <div className="mt-2 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={song.spotify_images as string}
                alt="Spotify album art"
                className="h-14 w-14 rounded object-cover"
                loading="lazy"
              />
              <p className="break-all text-[11px] text-gray-500">{song.spotify_images}</p>
            </div>
          ) : null}
          {song.music8_artist_slug && song.music8_song_slug ? (
            <p className="mt-2 text-[11px] text-gray-500">
              Music8 JSON URL:{' '}
              <a
                href={`https://xs867261.xsrv.jp/data/data/songs/${song.music8_artist_slug}_${song.music8_song_slug}.json`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                {`/data/songs/${song.music8_artist_slug}_${song.music8_song_slug}.json`}
              </a>
            </p>
          ) : null}
        </div>

        <AdminSongMusic8RefreshPanel songId={song.id} />
        <AdminSongMusic8JsonImportPanel
          songId={song.id}
          music8ArtistSlug={song.music8_artist_slug ?? null}
          music8SongSlug={song.music8_song_slug ?? null}
        />
        <AdminSongBasicInfoEditPanel
          songId={song.id}
          initialDisplayTitle={song.display_title ?? null}
          initialMainArtist={song.main_artist ?? null}
          initialSongTitle={song.song_title ?? null}
          initialStyle={song.style ?? null}
          initialOriginalReleaseDate={song.original_release_date ?? null}
        />
        <p>
          <span className="text-gray-500">作成日時：</span>
          {new Date(song.created_at).toLocaleString('ja-JP')}
        </p>
        <AdminSongMasterDeletePanel
          songId={song.id}
          confirmLabel={(song.display_title ?? '').trim() || song.id}
        />
      </section>

      {/* song_videos 一覧 */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">動画一覧（song_videos）</h2>
        {videos.length === 0 ? (
          <p className="text-gray-400 text-sm">紐づく動画はありません。</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">video_id</th>
                  <th className="px-2 py-1 text-left">variant</th>
                  <th className="px-2 py-1 text-left">performance_id</th>
                  <th className="px-2 py-1 text-left">YouTube公開</th>
                  <th className="px-2 py-1 text-left">登録日時</th>
                  <th className="px-2 py-1 text-left">基本コメント</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => {
                  const comm = commentaryMap.get(v.video_id);
                  return (
                    <tr key={v.video_id} className="border-t border-gray-800">
                      <td className="px-2 py-1 font-mono text-[11px] text-blue-300">
                        {v.video_id}
                      </td>
                      <td className="px-2 py-1">{v.variant ?? ''}</td>
                      <td className="px-2 py-1 text-[11px] font-mono text-gray-400">
                        {v.performance_id ?? ''}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-gray-300">
                        {v.youtube_published_at
                          ? new Date(v.youtube_published_at).toLocaleString('ja-JP')
                          : '—'}
                      </td>
                      <td className="px-2 py-1">
                        {new Date(v.created_at).toLocaleString('ja-JP')}
                      </td>
                      <td className="px-2 py-1 max-w-xs">
                        {comm ? (
                          <div className="text-gray-200">
                            <div className="whitespace-pre-wrap text-[11px] leading-snug">
                              {comm.body}
                            </div>
                            <div className="mt-1 text-[10px] text-gray-500">
                              ({new Date(comm.created_at).toLocaleString('ja-JP')})
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            song_commentary に登録なし
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* song_tidbits 一覧（豆知識） */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">
          豆知識ライブラリ（song_tidbits）
        </h2>
        {tidbits.length === 0 ? (
          <p className="text-gray-400 text-sm">
            この曲の豆知識はまだ登録されていません（AIコメント保存後に蓄積されます）。
          </p>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-auto">
            {tidbits.map((t) => {
              const preview = t.body.split('\n').slice(0, 3).join(' ');
              return (
                <div
                  key={t.id}
                  className="rounded border border-gray-700 bg-gray-800/70 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-200">
                        {t.source || 'ai'}
                      </span>
                      {t.video_id && (
                        <span className="font-mono text-[10px] text-blue-300">
                          {t.video_id}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {new Date(t.created_at).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-[11px] leading-snug text-gray-200">
                    {preview}
                    {t.body.length > preview.length ? ' …' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* comment_feedback 集計（AIコメント評価） */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">
          AIコメント評価（comment_feedback）
        </h2>
        {feedback.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Good / no good の集計対象となるフィードバックはまだありません。
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">video_id</th>
                  <th className="px-2 py-1 text-left">ai_message_id</th>
                  <th className="px-2 py-1 text-left">source</th>
                  <th className="px-2 py-1 text-right">Good</th>
                  <th className="px-2 py-1 text-right">no good</th>
                  <th className="px-2 py-1 text-left">コメント本文（先頭）</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => {
                  const preview = f.body.split('\n').slice(0, 2).join(' ');
                  return (
                    <tr key={`${f.videoId ?? 'null'}__${f.aiMessageId}`} className="border-t border-gray-800">
                      <td className="px-2 py-1 font-mono text-[10px] text-blue-300">
                        {f.videoId ?? '(なし)'}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-gray-400">
                        {f.aiMessageId}
                      </td>
                      <td className="px-2 py-1 text-[11px]">{f.source}</td>
                      <td className="px-2 py-1 text-right text-[11px] text-emerald-300">
                        {f.goodCount}
                      </td>
                      <td className="px-2 py-1 text-right text-[11px] text-red-300">
                        {f.badCount}
                      </td>
                      <td className="px-2 py-1 max-w-xs">
                        <div className="whitespace-pre-wrap text-[11px] leading-snug text-gray-200">
                          {preview}
                          {f.body.length > preview.length ? ' …' : ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 詳細フィードバック（チェックボックス・自由コメント） */}
        <h3 className="mb-2 mt-6 text-xs font-semibold text-gray-300">
          詳細フィードバック（チェック・自由コメント）
        </h3>
        {detailFeedbackRows.length === 0 ? (
          <p className="text-gray-400 text-sm">
            チェックまたは自由コメント付きのフィードバックはまだありません。
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">日時</th>
                  <th className="px-2 py-1 text-left">ユーザー</th>
                  <th className="px-2 py-1 text-left">video_id</th>
                  <th className="px-2 py-1 text-left">ai_message_id</th>
                  <th className="px-2 py-1 text-center">重複</th>
                  <th className="px-2 py-1 text-center">真偽</th>
                  <th className="px-2 py-1 text-center" title="曖昧・ありきたり（正誤はないが陳腐）">
                    ありきたり
                  </th>
                  <th className="px-2 py-1 text-left">自由コメント</th>
                  <th className="px-2 py-1 text-left">対象AIコメント（先頭）</th>
                </tr>
              </thead>
              <tbody>
                {detailFeedbackRows.map((r) => {
                  const bodyPreview = (r.body ?? '').split('\n').slice(0, 2).join(' ');
                  const t = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '—';
                  const chk = (v: boolean | null | undefined) =>
                    v === true ? '✓' : v === false ? '—' : '?';
                  return (
                    <tr key={r.id ?? `${r.ai_message_id}-${r.created_at}`} className="border-t border-gray-800">
                      <td className="whitespace-nowrap px-2 py-1 text-[10px] text-gray-400">{t}</td>
                      <td className="max-w-[140px] px-2 py-1 font-mono text-[10px] text-gray-300 break-all" title={r.user_id ?? ''}>
                        {r.user_id && r.user_id.trim() ? r.user_id : <span className="text-gray-500">ゲスト（未ログイン）</span>}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-blue-300">
                        {r.video_id ?? '(なし)'}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-gray-400">{r.ai_message_id}</td>
                      <td className="px-2 py-1 text-center text-amber-200">{chk(r.is_duplicate)}</td>
                      <td className="px-2 py-1 text-center text-amber-200">{chk(r.is_dubious)}</td>
                      <td className="px-2 py-1 text-center text-amber-200">{chk(r.is_ambiguous)}</td>
                      <td className="max-w-[200px] px-2 py-1 whitespace-pre-wrap text-[11px] text-gray-200">
                        {r.free_comment?.trim() ? r.free_comment.trim() : '—'}
                      </td>
                      <td className="max-w-xs px-2 py-1">
                        <div className="whitespace-pre-wrap text-[11px] leading-snug text-gray-200">
                          {bodyPreview}
                          {(r.body?.length ?? 0) > bodyPreview.length ? ' …' : ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">
          当該曲の選曲回数（ログインユーザー別）
        </h2>
        {userPickCounts.length === 0 ? (
          <p className="text-gray-400 text-sm">
            ログインユーザーの選曲履歴はまだありません（または取得対象外）。
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">user_id</th>
                  <th className="px-2 py-1 text-right">回数</th>
                </tr>
              </thead>
              <tbody>
                {userPickCounts.map((r) => (
                  <tr key={r.userId} className="border-t border-gray-800">
                    <td className="px-2 py-1 font-mono text-[11px] text-gray-300">{r.userId}</td>
                    <td className="px-2 py-1 text-right text-[11px] text-emerald-300">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {userPickCountTruncated ? (
          <p className="mt-2 text-[11px] text-amber-300">
            件数が多いため上限までで集計しています（最大 12,000 履歴行）。
          </p>
        ) : null}
      </section>
    </main>
  );
}


