/**
 * テーマプレイリスト・ミッション（固定お題）
 * マイページ「お題プレイリスト」および API で共有。
 */

export type ThemePlaylistDefinition = {
  id: string;
  labelJa: string;
  /** ユーザー向け短い説明 */
  descriptionJa: string;
  /** Gemini 向け: お題の観点・トーン（採点禁止など） */
  aiGuidanceJa: string;
};

export const THEME_PLAYLIST_MISSIONS: ThemePlaylistDefinition[] = [
  {
    id: 'christmas',
    labelJa: 'クリスマス',
    descriptionJa: '冬のホリデー気分に合う洋楽を集めましょう。',
    aiGuidanceJa:
      'クリスマスや年末年始のムードと、この曲をどう結びつけて楽しめそうか。宗教的断定や歌詞の長い引用は避ける。採点・順位・合否は禁止。',
  },
  {
    id: 'wake_up',
    labelJa: '目覚めの1曲',
    descriptionJa: '朝や起きたての気分を立てる一曲ずつ。',
    aiGuidanceJa:
      '「一日の始まり」「目が覚める」という観点で、テンポや音の明るさ・気持ちよさにつながる聴き方を短く。採点はしない。',
  },
  {
    id: 'bedtime',
    labelJa: 'お休みソング',
    descriptionJa: '眠る前に聴きたい穏やかな曲を集めましょう。',
    aiGuidanceJa:
      '就寝前・リラックスの観点。激しい演奏でも「締めの一曲」として聴けるならその言い方で。断定を避け、採点しない。',
  },
  {
    id: 'rainy_season',
    labelJa: '梅雨の窓辺',
    descriptionJa: '6月頃のじめっとした日や、雨の日の室内で聴きたい曲。',
    aiGuidanceJa:
      '雨・湿度・内向きの気分など、サウンドや雰囲気でつなぐ。歌詞の意味に依存しすぎない。採点しない。',
  },
  {
    id: 'summer_night',
    labelJa: '夏の夜',
    descriptionJa: '暑い季節の夜、外気や宵のイメージで選ぶ。',
    aiGuidanceJa:
      '夏の夜・湿度・開放感など、フィーリングでつなぐ。採点・ランキングは禁止。',
  },
  {
    id: 'sound_over_lyrics',
    labelJa: '音とフィーリング',
    descriptionJa: '歌詞よりサウンドや質感で選びたいとき向け。',
    aiGuidanceJa:
      '日本語で歌詞が追えなくても楽しめる点（ギター・ドラム・空間・テンポなど）に触れる。歌詞の内容を断定しない。採点しない。',
  },
  {
    id: 'nightcap',
    labelJa: '夜の一杯と',
    descriptionJa: '大人のリラックスタイムのBGM想定（飲酒を勧めない表現で）。',
    aiGuidanceJa:
      '落ち着いた夜の時間の雰囲気。過度な飲酒推奨や未成年を連想させる表現は避ける。採点しない。',
  },
];

const THEME_BY_ID = new Map(THEME_PLAYLIST_MISSIONS.map((t) => [t.id, t]));

export function getThemePlaylistDefinition(themeId: string): ThemePlaylistDefinition | null {
  const k = themeId.trim();
  return THEME_BY_ID.get(k) ?? null;
}

export const THEME_PLAYLIST_SLOT_TARGET = 10;
