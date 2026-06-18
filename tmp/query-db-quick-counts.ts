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
  const { count: total } = await admin.from("songs").select("*", { count: "exact", head: true });
  const { count: nullRelease } = await admin.from("songs").select("*", { count: "exact", head: true }).is("original_release_date", null);
  const { count: multiSpotify } = await admin.from("songs").select("*", { count: "exact", head: true }).not("spotify_artists", "is", null).like("spotify_artists", "%,%");
  const { count: wrongSlugBoth } = await admin.from("songs").select("*", { count: "exact", head: true }).eq("music8_song_slug", "both").eq("music8_artist_slug", "21-savage");
  console.log(JSON.stringify({ total_songs: total, with_original_release_date: (total??0)-(nullRelease??0), null_original_release_date: nullRelease, multi_spotify_artists_field: multiSpotify, songs_21savage_both_slug: wrongSlugBoth }, null, 2));
}
main();
