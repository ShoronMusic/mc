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
  if (!admin) process.exit(1);

  const songId = "c60891c6-5f87-4c0d-a511-2385721cd585";
  const { data: artist } = await admin.from("artists").select("id, name").eq("id", "45a21b3d-a25f-4044-aa9f-d7dae2ad7307").maybeSingle();
  console.log("songs.artist_id points to:", artist);

  // spotify multi but main_artist != first credit name
  let mismatch = 0;
  let multiSpotify = 0;
  let multiSpotifyNoCredits = 0;
  let offset = 0;
  const PAGE = 500;
  const samples: unknown[] = [];
  while (true) {
    const { data: batch } = await admin
      .from("songs")
      .select("id, display_title, main_artist, spotify_artists, original_release_date, music8_artist_slug")
      .not("spotify_artists", "is", null)
      .like("spotify_artists", "%,%")
      .range(offset, offset + PAGE - 1);
    if (!batch?.length) break;
    for (const s of batch) {
      multiSpotify++;
      const firstSpotify = (s.spotify_artists as string).split(",")[0]?.trim() ?? "";
      const { data: cr } = await admin
        .from("song_credits")
        .select("display_order, artists(name)")
        .eq("song_id", s.id)
        .order("display_order")
        .limit(1);
      const creditName = (cr?.[0] as { artists?: { name?: string } } | undefined)?.artists?.name ?? "";
      if (!cr?.length) {
        multiSpotifyNoCredits++;
        if (samples.length < 3) samples.push({ type: "no_credits", title: s.display_title, main: s.main_artist, spotify: s.spotify_artists });
        continue;
      }
      const main = (s.main_artist ?? "").trim();
      if (main && firstSpotify && main.toLowerCase() !== firstSpotify.toLowerCase() && main.toLowerCase() !== creditName.toLowerCase()) {
        mismatch++;
        if (samples.length < 6) samples.push({ type: "main_mismatch", title: s.display_title, main, firstSpotify, creditName });
      }
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
    if (offset % 2000 === 0) console.error(`scanned ${offset}...`);
  }

  console.log(JSON.stringify({
    multi_spotify_artists_songs: multiSpotify,
    multi_spotify_no_credits: multiSpotifyNoCredits,
    main_artist_vs_spotify_first_mismatch: mismatch,
    samples,
  }, null, 2));

  // original_release_date null count
  const { count: nullRelease } = await admin.from("songs").select("*", { count: "exact", head: true }).is("original_release_date", null);
  const { count: total } = await admin.from("songs").select("*", { count: "exact", head: true });
  console.log("\nrelease_date:", { total, null_original_release_date: nullRelease, with_date: (total ?? 0) - (nullRelease ?? 0) });
}

main().catch((e) => { console.error(e); process.exit(1); });
