import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatAiCreditAmount } from '@/lib/ai-credits-config';
import { listAiCreditTransactions } from '@/lib/user-ai-credits-server';
import { fetchUserAiTrialRow } from '@/lib/user-ai-trial-server';
import {
  deltaLabelForCreditTx,
  deltaLabelForTrialAt,
  deltaLabelForTrialGrant,
  deltaLabelForTrialSong,
  labelForAiUsageLedgerKind,
  mapCreditKindToLedgerKind,
  mergeAiUsageLedgerItems,
  type UserAiUsageLedgerItem,
} from '@/lib/user-ai-usage-ledger';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 120;

function isMissingTrialConsumptionLog(message: string): boolean {
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /user_ai_trial_consumption_log/i.test(message)
  );
}

/**
 * GET: ログインユーザーの AI 枠・クレジット履歴（お試し付与／消費＋クレジット取引）。
 * service_role で読み、本人以外は返さない。
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
      : DEFAULT_LIMIT;

    const items: UserAiUsageLedgerItem[] = [];

    const trial = await fetchUserAiTrialRow(admin, user.id);
    if (trial.row) {
      const grantAt =
        (typeof trial.row.email_verified_at_grant === 'string' &&
        trial.row.email_verified_at_grant.trim()
          ? trial.row.email_verified_at_grant
          : null) || trial.row.created_at;
      items.push({
        id: `trial-grant:${user.id}`,
        at: grantAt,
        kind: 'trial_grant',
        label: labelForAiUsageLedgerKind('trial_grant'),
        deltaLabel: deltaLabelForTrialGrant(
          trial.row.songs_granted,
          trial.row.at_questions_granted,
        ),
        balanceAfterLabel: null,
        roomId: null,
        videoId: null,
        note: null,
        source: 'trial',
      });
    }

    const { data: trialLogs, error: trialLogErr } = await admin
      .from('user_ai_trial_consumption_log')
      .select('id, kind, room_id, video_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (trialLogErr && !isMissingTrialConsumptionLog(trialLogErr.message)) {
      console.warn('[api/user/ai-usage-ledger] trial log', trialLogErr.message);
    } else if (!trialLogErr) {
      for (const row of trialLogs ?? []) {
        const kindRaw = typeof row.kind === 'string' ? row.kind : '';
        const ledgerKind = kindRaw === 'at_question' ? 'trial_at' : 'trial_song';
        items.push({
          id: `trial-log:${String(row.id)}`,
          at: String(row.created_at),
          kind: ledgerKind,
          label: labelForAiUsageLedgerKind(ledgerKind),
          deltaLabel: ledgerKind === 'trial_at' ? deltaLabelForTrialAt() : deltaLabelForTrialSong(),
          balanceAfterLabel: null,
          roomId: typeof row.room_id === 'string' ? row.room_id : null,
          videoId: typeof row.video_id === 'string' ? row.video_id : null,
          note: null,
          source: 'trial',
        });
      }
    }

    const creditTx = await listAiCreditTransactions(admin, user.id, limit);
    if (creditTx.error) {
      console.warn('[api/user/ai-usage-ledger] credit tx', creditTx.error);
    }
    for (const row of creditTx.rows) {
      const kind = mapCreditKindToLedgerKind(row.kind);
      items.push({
        id: `credit:${row.id}`,
        at: row.createdAt,
        kind,
        label: labelForAiUsageLedgerKind(kind),
        deltaLabel: deltaLabelForCreditTx(row.kind, row.delta),
        balanceAfterLabel: `残高 ${formatAiCreditAmount(row.balanceAfter)}`,
        roomId: row.roomId,
        videoId: row.videoId,
        note: row.note,
        source: 'credits',
      });
    }

    const merged = mergeAiUsageLedgerItems(items, limit);

    return NextResponse.json({
      items: merged,
      trialLogAvailable: !trialLogErr,
      creditTxAvailable: !creditTx.missingTable,
      trialSongsRemaining: trial.row
        ? Math.max(0, Number(trial.row.songs_remaining) || 0)
        : null,
      trialSongsGranted: trial.row
        ? Math.max(0, Number(trial.row.songs_granted) || 0)
        : null,
    });
  } catch (e) {
    console.error('[api/user/ai-usage-ledger]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
