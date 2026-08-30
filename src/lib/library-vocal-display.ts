/**
 * ライブラリ曲詳細のボーカル表示。F / M / F,M 以外は出さない。
 */
export function formatLibraryVocalDisplay(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  const tokens = s
    .split(/[,/、＆&＋+]|\s+and\s+|\s+と\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const parts = tokens.length > 0 ? tokens : [s];

  let hasF = false;
  let hasM = false;
  for (const t of parts) {
    const compact = t.toLowerCase().replace(/[\s._-]+/g, '');
    if (/^(fm|mf|f\/m|m\/f)$/.test(compact) || compact === 'f,m' || compact === 'm,f') {
      hasF = true;
      hasM = true;
      continue;
    }
    if (/^(f|female|woman|women|girl|girls|女|女性|女声)$/i.test(compact)) {
      hasF = true;
      continue;
    }
    if (/^(m|male|man|men|boy|boys|男|男性|男声)$/i.test(compact)) {
      hasM = true;
      continue;
    }
    if (/(女性|女声|\bfemale\b|\bwomen\b)/i.test(t)) hasF = true;
    if (/(男性|男声|\bmale\b|\bmen\b)/i.test(t) && !/\bfemale\b/i.test(t)) hasM = true;
  }

  if (hasF && hasM) return 'F,M';
  if (hasF) return 'F';
  if (hasM) return 'M';
  return null;
}
