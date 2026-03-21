import { createClient } from '@/lib/supabase/server';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

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
  created_at: string;
}

interface SongVideoRow {
  video_id: string;
  variant: string | null;
  performance_id: string | null;
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
    .select('id, display_title, main_artist, song_title, style, play_count, created_at')
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

  const song = data as SongRow;

  // song_videos の取得
  let videos: SongVideoRow[] = [];
  try {
    const { data: videoData, error: videoError } = await supabase
      .from('song_videos')
      .select('video_id, variant, performance_id, created_at')
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
          <span className="text-gray-500">作成日時：</span>
          {new Date(song.created_at).toLocaleString('ja-JP')}
        </p>
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
    </main>
  );
}


