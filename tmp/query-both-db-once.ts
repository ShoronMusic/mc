import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

function loadDotEnvLocal() {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) { console.error("no admin"); process.exit(1); }

  const songId = "c60891c6-5f87-4c0d-a511-2385721cd585";
  const { data: song, error } = await admin
    .from("songs")
    .select("id, display_title, main_artist, song_title, music8_artist_slug, music8_song_slug, music8_song_id, music8_video_id, spotify_artists, original_release_date, artist_id, music8_song_data, song_videos(video_id, variant)")
    .eq("id", songId)
    .maybeSingle();
  if (error) throw error;
  console.log("=== BOTH song row ===");
  const { music8_song_data, song_videos, ...rest } = (song ?? {}) as Record<string, unknown>;
  console.log(JSON.stringify(rest, null, 2));
  if (song_videos) console.log("song_videos:", JSON.stringify(song_videos, null, 2));
  if (music8_song_data) {
    const snap = music8_song_data as Record<string, unknown>;
    console.log("music8_song_data slim:", JSON.stringify({
      kind: snap.kind,
      stable_key: snap.stable_key,
      main_artists: snap.main_artists,
      spotify_artists: snap.spotify_artists,
      releaseDate_normalized: snap.releaseDate_normalized,
    }, null, 2));
  }

  const { data: credits } = await admin
    .from("song_credits")
    .select("role, display_order, is_display_main, source, artists(id, name, music8_artist_slug)")
    .eq("song_id", songId)
    .order("display_order", { ascending: true });
  console.log("\n=== song_credits ===");
  console.log(JSON.stringify(credits, null, 2));

  const { count: totalSongs } = await admin.from("songs").select("*", { count: "exact", head: true });
  const { count: withCredits } = await admin.from("song_credits").select("song_id", { count: "exact", head: true });
  const { data: creditDistinct } = await admin.from("song_credits").select("song_id");
  const distinctSongsWithCredits = new Set((creditDistinct ?? []).map((r: { song_id: string }) => r.song_id)).size;

  const { data: multiSpotifySample } = await admin
    .from("songs")
    .select("id, display_title, main_artist, spotify_artists, original_release_date, music8_artist_slug")
    .not("spotify_artists", "is", null)
    .like("spotify_artists", "%,%")
    .limit(5);

  console.log("\n=== DB summary ===");
  console.log(JSON.stringify({
    total_songs: totalSongs,
    song_credits_rows: withCredits,
    songs_with_any_credit: distinctSongsWithCredits,
    songs_without_credits: (totalSongs ?? 0) - distinctSongsWithCredits,
  }, null, 2));

  // multi-credit songs count (approx via raw query workaround)
  let multiCreditSongs = 0;
  let offset = 0;
  const page = 1000;
  while (true) {
    const { data: batch } = await admin.from("song_credits").select("song_id").range(offset, offset + page - 1);
    if (!batch?.length) break;
    const counts = new Map<string, number>();
    for (const row of batch) counts.set(row.song_id, (counts.get(row.song_id) ?? 0) + 1);
    for (const c of counts.values()) if (c >= 2) multiCreditSongs++;
    if (batch.length < page) break;
    offset += page;
  }
  console.log("multi_credit_songs_in_first_pass_estimate:", multiCreditSongs, "(rough)");

  console.log("\n=== sample multi spotify_artists songs ===");
  for (const s of multiSpotifySample ?? []) {
    const { data: cr } = await admin.from("song_credits").select("display_order, role, artists(name)").eq("song_id", s.id).order("display_order");
    console.log(JSON.stringify({ ...s, credits: cr }, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
