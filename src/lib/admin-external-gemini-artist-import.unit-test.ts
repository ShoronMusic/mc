import assert from 'node:assert/strict';
import {
  coerceExternalGeminiArtistFields,
  extractYoutubeChannelIdClient,
  mergeExternalGeminiArtistClipboardIntoDraft,
  normalizeAdminArtistOriginCountry,
  parseExternalGeminiArtistClipboardJson,
} from '@/lib/admin-external-gemini-artist-import';
import { emptyAdminArtistProfileDraft } from '@/lib/admin-artist-profile-parse';

{
  const parsed = parseExternalGeminiArtistClipboardJson(
    JSON.stringify({
      本文: 'Buffalo Traffic Jam is a US band.\nバッファロー・トラフィック・ジャムは米国のバンド。',
      Origin: 'USA',
      活動開始年: '2023 - 現在',
      '生年月日（個人の場合）': '-',
      日本語読み: 'バッファロー・トラフィック・ジャム',
      '永眠（個人の場合）': '-',
      Occupation: 'Band, Project',
      'YouTube Channel': 'UCVBn_73DiztMsn9G6nKsn7g',
      'Wikipedia Page': '-',
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error('parse failed');

  const coerced = coerceExternalGeminiArtistFields(parsed.data);
  assert.ok(typeof coerced['本文'] === 'string');
  assert.equal(coerced['Origin'], 'USA');

  const base = emptyAdminArtistProfileDraft('Buffalo Traffic Jam', 'western');
  base.nameBase = 'Buffalo Traffic Jam';
  base.thePrefix = null;
  base.spotifyArtistId = 'keep-me';

  const merged = mergeExternalGeminiArtistClipboardIntoDraft(
    base,
    JSON.stringify(parsed.data),
  );
  assert.equal(merged.ok, true);
  if (!merged.ok) throw new Error('merge failed');
  assert.equal(merged.draft.originCountry, 'US');
  assert.equal(merged.draft.nameJa, 'バッファロー・トラフィック・ジャム');
  assert.ok(merged.draft.occupations.includes('Band'));
  assert.equal(merged.draft.youtubeChannelId, 'UCVBn_73DiztMsn9G6nKsn7g');
  assert.equal(merged.draft.spotifyArtistId, 'keep-me');
  assert.equal(merged.draft.nameBase, 'Buffalo Traffic Jam');
  assert.ok((merged.draft.descriptionEn ?? '').includes('Buffalo Traffic Jam'));
  assert.ok((merged.draft.profileText ?? '').includes('バッファロー'));
  assert.equal(merged.draft.activePeriod, '2023 -');
}

assert.equal(normalizeAdminArtistOriginCountry('USA'), 'US');
assert.equal(normalizeAdminArtistOriginCountry('Germany'), 'GER');
assert.equal(extractYoutubeChannelIdClient('UCVBn_73DiztMsn9G6nKsn7g'), 'UCVBn_73DiztMsn9G6nKsn7g');

{
  const empty = mergeExternalGeminiArtistClipboardIntoDraft(
    emptyAdminArtistProfileDraft('X', 'western'),
    '   ',
  );
  assert.equal(empty.ok, false);
}

console.log('admin-external-gemini-artist-import.unit-test: ok');
