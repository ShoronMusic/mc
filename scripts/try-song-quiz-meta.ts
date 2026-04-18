/**
 * 曲解説後クイズ第一段階（songQuiz メタ）の手元確認用。
 *
 * 使い方（リポジトリルート）:
 *   node --env-file=.env.local --import tsx scripts/try-song-quiz-meta.ts [videoId]
 *
 * 例:
 *   node --env-file=.env.local --import tsx scripts/try-song-quiz-meta.ts nkhJN1DpV1I
 *
 * `YOUTUBE_API_KEY` があると `videos.list` の channelId まで表示。無い場合は **oEmbed だけ**でも `songQuiz` 判定は試せる。
 * クイズメタを見るには `SONG_QUIZ_AFTER_COMMENTARY_ENABLED=1` を `.env.local` に付けること。
 */
import { buildSongQuizApiExtension, isSongQuizAfterCommentaryEnabled } from '../src/lib/song-quiz-after-commentary';
import { fetchOEmbed } from '../src/lib/youtube-oembed';
import { getVideoSnippet } from '../src/lib/youtube-search';

/** 公式 VEVO 想定で oEmbed が取れる ID（`YOUTUBE_API_KEY` なしでも試せる） */
const videoId = (process.argv[2] ?? 'vx2u5uUu3DE').trim();

async function main() {
  console.log('videoId:', videoId);
  console.log('SONG_QUIZ_AFTER_COMMENTARY_ENABLED →', isSongQuizAfterCommentaryEnabled() ? '1 (ON)' : 'OFF');

  const [oembed, snippet] = await Promise.all([
    fetchOEmbed(videoId),
    getVideoSnippet(videoId, { source: 'scripts/try-song-quiz-meta' }),
  ]);

  if (!oembed?.title && !snippet) {
    console.error('\noEmbed も getVideoSnippet も失敗しました。動画 ID を確認してください。\n');
    process.exitCode = 1;
    return;
  }

  const rawTitle = oembed?.title ?? snippet?.title ?? videoId;
  const authorName = oembed?.author_name ?? snippet?.channelTitle ?? null;

  const ext = buildSongQuizApiExtension({
    channelId: snippet?.channelId ?? null,
    channelTitle: snippet?.channelTitle ?? oembed?.author_name ?? null,
    videoTitle: rawTitle,
    channelAuthorName: authorName,
  });

  console.log('\nYouTube メタ（抜粋）:');
  console.log({
    channelId: snippet?.channelId ?? '(oEmbed のみのため未取得)',
    channelTitle: snippet?.channelTitle ?? oembed?.author_name,
    title: (snippet?.title ?? oembed?.title)?.slice(0, 80),
    oEmbedAuthor: oembed?.author_name,
    getVideoSnippet: snippet ? 'OK' : 'スキップ（YOUTUBE_API_KEY なし等）',
  });

  console.log('\nsongQuiz（API と同形）:');
  console.log(JSON.stringify(ext, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
