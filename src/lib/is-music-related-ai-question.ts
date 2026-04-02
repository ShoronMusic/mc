/**
 * 「@ …」AI 質問が音楽関連っぽいかのクライアント側ヒューリスティック。
 * 厳密な自然言語理解ではなく、誤爆を減らすためのキーワード列挙。
 */
const MUSIC_KEYWORD_SOURCES = [
  // 一般
  '音楽',
  '洋楽',
  '邦楽',
  '曲',
  '曲名',
  '曲調',
  '歌',
  '歌名',
  '歌詞',
  'アーティスト',
  'バンド',
  'アルバム',
  'ライブ',
  'mv',
  'メロディ',
  'ジャンル',
  'タイトル',
  '聴',
  // 流行・時代（「この時代に流行ったシンセポップは？」等）
  '流行',
  'ヒット',
  'チャート',
  'ランキング',
  '年代',
  '時代',
  // ジャンル系（部分一致でシンセポップ・パワーポップ等をカバー）
  'ポップ',
  'ロック',
  'シンセ',
  'ジャズ',
  'ソウル',
  'ファンク',
  'ディスコ',
  'ブルース',
  'メタル',
  'パンク',
  'レゲエ',
  'ヒップホップ',
  'ラップ',
  'テクノ',
  'エレクトロ',
  'ハウス',
  'オルタナ',
  'インディ',
  'プログレ',
  'AOR',
  'R&B',
  'RnB',
  // 英語（単語境界）
  '\\btitle\\b',
  '\\bsynth\\b',
  '\\bpop\\b',
  '\\bera\\b',
  '\\bhit\\b',
  '\\bchart\\b',
  '\\bgenre\\b',
  '\\bedm\\b',
  'billboard',
  'spotify',
  'youtube',
  'playlist',
  'song',
  'music',
  'artist',
  'band',
  'album',
  'track',
  'lyrics',
] as const;

const MUSIC_RELATED_RE = new RegExp(MUSIC_KEYWORD_SOURCES.join('|'), 'i');

export function isMusicRelatedAiQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return MUSIC_RELATED_RE.test(t);
}
