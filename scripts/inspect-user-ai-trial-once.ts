/**
 * 単発: user_ai_trial / consumption_log を表示（秘密情報は出さない）
 * 実行: npx tsx scripts/inspect-user-ai-trial-once.ts <user_id>
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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

loadDotEnvLocal();

const userId = process.argv[2]?.trim();
if (!userId) {
  console.error('Usage: npx tsx scripts/inspect-user-ai-trial-once.ts <user_id>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const trial = await admin.from('user_ai_trial').select('*').eq('user_id', userId).maybeSingle();
  const logs = await admin
    .from('user_ai_trial_consumption_log')
    .select('kind, room_id, video_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const authUser = await admin.auth.admin.getUserById(userId);

  const rows = logs.data ?? [];
  const byKind = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        userId,
        enforcement: process.env.AI_TRIAL_ENFORCEMENT_ENABLED ?? '(unset)',
        trial: trial.data,
        trialError: trial.error?.message ?? null,
        consumptionTotal: rows.length,
        consumptionByKind: byKind,
        consumptionLogError: logs.error?.message ?? null,
        firstConsumption: rows[0] ?? null,
        lastConsumption: rows[rows.length - 1] ?? null,
        email: authUser.data.user?.email ?? null,
        emailConfirmedAt: authUser.data.user?.email_confirmed_at ?? null,
        authCreatedAt: authUser.data.user?.created_at ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
