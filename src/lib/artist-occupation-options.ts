/**
 * Music8 / WP ACF `Occupation` チェックボックス相当。
 * value は ACF の value、label は管理画面表示・`artists.occupations` 保存用。
 */
export type ArtistOccupationOption = {
  value: string;
  label: string;
};

/** WP と同順に近い並び（よく使うもの先頭） */
export const ARTIST_OCCUPATION_OPTIONS: readonly ArtistOccupationOption[] = [
  { value: 'band', label: 'Band' },
  { value: 'singer', label: 'Singer' },
  { value: 'musician', label: 'Musician' },
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'ssw', label: 'SSW' },
  { value: 'rapper', label: 'Rapper' },
  { value: 'duo', label: 'Duo' },
  { value: 'group', label: 'Group' },
  { value: 'dj', label: 'DJ' },
  { value: 'producer', label: 'Producer' },
  { value: 'composer', label: 'Composer' },
  { value: 'guitarist', label: 'Guitarist' },
  { value: 'bassist', label: 'Bassist' },
  { value: 'drummer', label: 'Drummer' },
  { value: 'pianist', label: 'Pianist' },
  { value: 'multi-instrumentalist', label: 'Multi-instrumentalist' },
  { value: 'instrumentalist', label: 'Instrumentalist' },
  { value: 'violinist', label: 'Violinist' },
  { value: 'saxophone', label: 'Saxophone' },
  { value: 'trumpeter', label: 'Trumpeter' },
  { value: 'beatboxer', label: 'Beatboxer' },
  { value: 'actor', label: 'Actor' },
  { value: 'actress', label: 'Actress' },
  { value: 'musicproject', label: 'Music Project' },
  { value: 'pastor', label: 'Pastor' },
] as const;

/** Music8 の typo（guitaristr）等の別名 */
const OCCUPATION_ALIASES: Record<string, string> = {
  guitaristr: 'guitarist',
  'music project': 'musicproject',
  'singer-songwriter': 'ssw',
  'singer songwriter': 'ssw',
};

function normalizeOccupationKey(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return OCCUPATION_ALIASES[t] ?? t.replace(/\s+/g, '');
}

export function findArtistOccupationOption(raw: string): ArtistOccupationOption | null {
  const key = normalizeOccupationKey(raw);
  if (!key) return null;
  return (
    ARTIST_OCCUPATION_OPTIONS.find(
      (o) => o.value === key || normalizeOccupationKey(o.label) === key,
    ) ?? null
  );
}

/** 選択配列を正規化（既知は label に寄せ、未知はそのまま） */
export function canonicalizeArtistOccupations(selected: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of selected) {
    const t = raw.trim();
    if (!t) continue;
    const opt = findArtistOccupationOption(t);
    const label = opt?.label ?? t;
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  return out;
}

export function isArtistOccupationSelected(selected: string[], option: ArtistOccupationOption): boolean {
  return selected.some((s) => {
    const opt = findArtistOccupationOption(s);
    if (opt) return opt.value === option.value;
    return s.trim().toLowerCase() === option.label.toLowerCase();
  });
}

export function toggleArtistOccupation(selected: string[], option: ArtistOccupationOption): string[] {
  const on = isArtistOccupationSelected(selected, option);
  if (on) {
    return selected.filter((s) => {
      const opt = findArtistOccupationOption(s);
      if (opt) return opt.value !== option.value;
      return s.trim().toLowerCase() !== option.label.toLowerCase();
    });
  }
  return canonicalizeArtistOccupations([...selected, option.label]);
}

/** 選択肢に無いカスタム値 */
export function extraArtistOccupations(selected: string[]): string[] {
  return selected.filter((s) => !findArtistOccupationOption(s));
}
