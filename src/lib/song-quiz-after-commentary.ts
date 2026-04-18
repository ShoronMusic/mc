import {
  evaluateSongQuizOfficialHeuristic,
  type SongQuizOfficialTier,
} from '@/lib/song-quiz-official-heuristic';

/** `.env` で `1` のときのみ、曲解説 API レスポンスに `songQuiz` を付与する（第一段階は公式ヒューリスティックのみ）。 */
export function isSongQuizAfterCommentaryEnabled(): boolean {
  return process.env.SONG_QUIZ_AFTER_COMMENTARY_ENABLED === '1';
}

export type SongQuizApiBlock =
  | { enabled: false }
  | {
      enabled: true;
      officialTier: SongQuizOfficialTier;
      /** 第一段階: ヒューリスティックが allow のとき true（将来の出題本体のフラグ） */
      includeQuiz: boolean;
      skipReason?: 'not_official_heuristic' | 'uncertain_official_signal';
    };

/**
 * `/api/ai/comment-pack`・`/api/ai/commentary` 向け。クライアントは `enabled` と `includeQuiz` を見る。
 */
export function buildSongQuizApiExtension(args: {
  channelId: string | null | undefined;
  channelTitle: string | null | undefined;
  videoTitle: string | null | undefined;
  channelAuthorName?: string | null | undefined;
}): { songQuiz: SongQuizApiBlock } {
  if (!isSongQuizAfterCommentaryEnabled()) {
    return { songQuiz: { enabled: false } };
  }
  const { tier } = evaluateSongQuizOfficialHeuristic(args);
  if (tier === 'allow') {
    return {
      songQuiz: {
        enabled: true,
        officialTier: 'allow',
        includeQuiz: true,
      },
    };
  }
  if (tier === 'deny') {
    return {
      songQuiz: {
        enabled: true,
        officialTier: 'deny',
        includeQuiz: false,
        skipReason: 'not_official_heuristic',
      },
    };
  }
  return {
    songQuiz: {
      enabled: true,
      officialTier: 'uncertain',
      includeQuiz: false,
      skipReason: 'uncertain_official_signal',
    },
  };
}
