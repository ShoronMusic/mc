/**
 * Music8 曲データから取りたい項目の抽出。
 * - description（曲説明）: content から取得
 * - genres: 複数（例: New wave, Soft rock）
 * - releaseDate: 年月まで（例: 1983.05）
 * - styles: ID 配列（例: [2849]）＋ style_id.txt で名前解決（例: Rock）
 *
 * ref: ref/police_every-breath-you-take.json, ref/style_id.txt
 */

/** ref/style_id.txt の逆引き（ID → スタイル名） */
export const MUSIC8_STYLE_ID_TO_NAME: Record<string, string> = {
  '2849': 'Rock',
  '2844': 'Pop',
  '4686': 'Dance',
  '2845': 'Alternative',
  '2846': 'Electronica',
  '2847': 'R&B',
  '2848': 'Hip-Hop',
  '6409': 'Metal',
  '2873': 'Others',
};

export interface Music8SongExtract {
  /** 曲の説明（HTML 含む）。曲 JSON の content */
  description: string;
  /** ジャンル名の配列（例: ["New wave", "Soft rock"]） */
  genres: string[];
  /** リリース年月（例: "1983.05"） */
  releaseDate: string;
  /** スタイル ID の配列（例: [2849]） */
  styleIds: number[];
  /** スタイル ID をスタイル名にした配列（例: ["Rock"]）。style_id.txt に無い ID はそのまま文字列で */
  styleNames: string[];
}

function asObj(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function asStr(x: unknown): string {
  if (typeof x === 'string') return x;
  return '';
}

function asArr(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  return [];
}

/** ISO 日付または YYYY-MM-DD から YYYY.MM を返す */
function formatReleaseYearMonth(value: string): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}`;
  const m2 = s.match(/^(\d{4})\.(\d{2})/);
  if (m2) return `${m2[1]}.${m2[2]}`;
  return s.slice(0, 7).replace(/-/g, '.');
}

/**
 * 曲 JSON / アーティスト JSON の songs[].1 件 のどちらでも渡せる。
 * - 曲 JSON: content, genres[], releaseDate, styles[]
 * - アーティストページ曲: content, genre_data[] or genres[], date / date_gmt, style[] or styles[]
 */
export function extractMusic8SongFields(data: unknown): Music8SongExtract {
  const obj = asObj(data);
  const result: Music8SongExtract = {
    description: '',
    genres: [],
    releaseDate: '',
    styleIds: [],
    styleNames: [],
  };

  if (!obj) return result;

  // 曲単体 JSON は content が文字列のことも、アーティスト JSON の songs[] は content.rendered のことがある
  const contentRaw = obj.content ?? obj.description;
  const descriptionStr =
    typeof contentRaw === 'string'
      ? contentRaw
      : asStr(asObj(contentRaw)?.rendered ?? '');
  // 曲説明文の改行は1回だけにする（連続改行を1つにまとめる）
  result.description = descriptionStr
    .trim()
    .replace(/(\r?\n){2,}/g, '\n');

  const genresSrc = obj.genres ?? obj.genre_data;
  if (Array.isArray(genresSrc)) {
    result.genres = genresSrc
      .map((g) => {
        const item = asObj(g);
        if (item && typeof item.name === 'string') return item.name.trim();
        return '';
      })
      .filter(Boolean);
  }

  const dateSrc = asStr(obj.releaseDate ?? obj.date ?? obj.date_gmt ?? '');
  result.releaseDate = dateSrc ? formatReleaseYearMonth(dateSrc) : '';

  const styleIdsSrc = obj.styles ?? obj.style ?? [];
  const ids = Array.isArray(styleIdsSrc) ? styleIdsSrc : [styleIdsSrc];
  for (const id of ids) {
    const n = typeof id === 'number' ? id : Number(id);
    if (!Number.isNaN(n)) {
      result.styleIds.push(n);
      const name = MUSIC8_STYLE_ID_TO_NAME[String(n)];
      result.styleNames.push(name ?? String(n));
    }
  }

  return result;
}
