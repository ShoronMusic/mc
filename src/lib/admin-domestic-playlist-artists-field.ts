/**
 * 邦楽 PL 表のアーティスト欄パース（クライアント安全・Node 依存なし）。
 */

export function parseCreditArtistsInput(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,、]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** 表の「アーティスト」欄: 先頭＝main、以降＝共演（カンマ区切り） */
export function parsePlaylistArtistsField(raw: string): {
  mainArtist: string;
  creditArtists: string[];
} {
  const names = parseCreditArtistsInput(raw);
  return {
    mainArtist: names[0] ?? '',
    creditArtists: names.slice(1),
  };
}

export function buildExplicitCreditArtists(
  mainArtist: string,
  creditArtists: string[] | null | undefined,
): string[] {
  const main = mainArtist.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const n = name.trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  if (main) push(main);
  for (const name of creditArtists ?? []) push(name);
  return out;
}

export function formatPlaylistArtistsField(
  mainArtist: string,
  creditArtists?: string[] | null,
): string {
  return buildExplicitCreditArtists(mainArtist, creditArtists).join(', ');
}
