/**
 * プレフィックス違いで同一曲が2行ある場合、The 付き行を残しもう一方の song_videos を移して削除。
 * 対象 slug: 1975, sugarhill-gang, pretenders（normalize dry-run の衝突3件）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';
import { buildSongDisplayTitle } from '../src/lib/music8-canonical-artist-name';

const TARGET_SLUGS = ['1975', 'sugarhill-gang', 'pretenders'];

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function titleKey(songTitle: string): string {
  return songTitle.trim().toLowerCase();
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) process.exit(1);

  for (const slug of TARGET_SLUGS) {
    const { data: songs, error } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, music8_artist_slug')
      .eq('music8_artist_slug', slug);
    if (error) throw error;
    const rows = songs ?? [];
    const { data: master } = await admin
      .from('artists')
      .select('id, name')
      .eq('music8_artist_slug', slug)
      .maybeSingle();
    const canonical = (master?.name ?? '').trim() || null;

    const byTitle = new Map<string, typeof rows>();
    for (const s of rows) {
      const tk = titleKey((s.song_title ?? '').trim() || (s.display_title ?? '').split(' - ').slice(1).join(' - '));
      if (!tk) continue;
      const arr = byTitle.get(tk) ?? [];
      arr.push(s);
      byTitle.set(tk, arr);
    }

    for (const [tk, group] of byTitle) {
      if (group.length < 2) continue;
      const withThe = group.filter((s) => /^(the|a|an)\s+/i.test((s.main_artist ?? '').trim()));
      const withoutThe = group.filter((s) => !/^(the|a|an)\s+/i.test((s.main_artist ?? '').trim()));
      if (withThe.length === 0 || withoutThe.length === 0) continue;

      const keep = withThe[0];
      for (const drop of withoutThe) {
        console.log(`[${slug}] merge ${drop.id} (${drop.display_title}) -> ${keep.id} (${keep.display_title})`);
        if (!apply) continue;

        const { data: vids } = await admin
          .from('song_videos')
          .select('video_id, variant, performance_id, youtube_published_at')
          .eq('song_id', drop.id);
        for (const v of vids ?? []) {
          await admin.from('song_videos').upsert(
            {
              song_id: keep.id,
              video_id: v.video_id,
              variant: v.variant,
              performance_id: v.performance_id,
              youtube_published_at: v.youtube_published_at,
            },
            { onConflict: 'video_id' },
          );
        }
        await admin.from('songs').delete().eq('id', drop.id);
      }
    }

    if (apply && canonical) {
      for (const s of rows) {
        if ((s.main_artist ?? '').trim() === canonical) continue;
        const title = (s.song_title ?? '').trim();
        const dt = buildSongDisplayTitle(canonical, title);
        await admin
          .from('songs')
          .update({
            main_artist: canonical,
            display_title: dt,
            artist_id: master?.id ?? null,
          })
          .eq('id', s.id);
      }
      await admin
        .from('songs')
        .update({ artist_id: master?.id ?? null })
        .eq('music8_artist_slug', slug);
    }
  }

  console.log(apply ? 'done apply' : 'dry-run (use --apply)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
