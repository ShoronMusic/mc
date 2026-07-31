/**
 * `artist-search-nicknames.json` から `artists.aliases` シード用 SQL を標準出力する。
 * 使い方: npx tsx scripts/print-artist-nickname-seed-sql.ts
 *
 * 生成した UPDATE は name / name_ja の曖昧一致のため、実行前に対象行を確認すること。
 */

import { listArtistSearchNicknameEntries } from '../src/lib/artist-search-nicknames';

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function main() {
  console.log('-- generated from src/config/artist-search-nicknames.json');
  console.log('alter table public.artists add column if not exists aliases text[] null;');
  console.log('create index if not exists idx_artists_aliases_gin on public.artists using gin (aliases);');
  console.log('');

  for (const entry of listArtistSearchNicknameEntries()) {
    const aliases = [...entry.nicknames];
    if (aliases.length === 0) continue;
    const aliasArray = `array[${aliases.map(sqlString).join(', ')}]::text[]`;
    const nameConds: string[] = [`lower(name) = lower(${sqlString(entry.canonical)})`];
    for (const ja of entry.nameJa ?? []) {
      nameConds.push(`coalesce(name_ja, '') ilike ${sqlString(`%${ja}%`)}`);
      nameConds.push(`name ilike ${sqlString(`%${ja}%`)}`);
    }
    for (const extra of entry.alsoSearch ?? []) {
      nameConds.push(`lower(name) = lower(${sqlString(extra)})`);
      nameConds.push(`coalesce(name_ja, '') ilike ${sqlString(`%${extra}%`)}`);
    }
    console.log(`-- ${entry.canonical} ← ${aliases.join(', ')}`);
    console.log(`update public.artists`);
    console.log(`set aliases = (`);
    console.log(`  select array_agg(distinct a)`);
    console.log(`  from unnest(coalesce(aliases, '{}'::text[]) || ${aliasArray}) as t(a)`);
    console.log(`)`);
    console.log(`where ${nameConds.join('\n   or ')};`);
    console.log('');
  }
}

main();
