import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAiUnlimitedRole } from '@/lib/ai-unlimited-user-ids';
import {
  buildDeveloperUnlimitedAiTrialStatus,
  buildEmailUnconfirmedAiTrialStatus,
  buildPreviewAiTrialStatus,
  buildSupporterUnlimitedAiTrialStatus,
  buildTrialEligibleAiTrialStatus,
  buildTrialEmailCoolingAiTrialStatus,
  buildTrialIpLimitedAiTrialStatus,
  isAiTrialEnforcementEnabled,
} from '@/lib/ai-trial-status';
import { requiresEmailConfirmation } from '@/lib/supabase-email-auth';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import {
  bumpExistingTrialSongsIfNeeded,
  fetchUserAiTrialRow,
  peekUserAiTrialGrantEligibility,
} from '@/lib/user-ai-trial-server';
import { loadComposedAiTrialStatus } from '@/lib/user-ai-credits-server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET: ログインユーザーの AI お試し残数。
 * 行が無い場合は付与せず資格のみ返す（付与は初回の AI 実利用時）。
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const unlimitedRole = resolveAiUnlimitedRole(user.id);
    if (unlimitedRole === 'developer') {
      return NextResponse.json(buildDeveloperUnlimitedAiTrialStatus());
    }
    if (unlimitedRole === 'supporter') {
      return NextResponse.json(buildSupporterUnlimitedAiTrialStatus());
    }

    if (requiresEmailConfirmation(user)) {
      return NextResponse.json(buildEmailUnconfirmedAiTrialStatus());
    }

    if (!isAiTrialEnforcementEnabled()) {
      return NextResponse.json(buildPreviewAiTrialStatus());
    }

    const clientIp = getChatAiClientIp(request);
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Failed to load trial.' }, { status: 503 });
    }

    const existing = await fetchUserAiTrialRow(admin, user.id);
    if (existing.missingTable) {
      return NextResponse.json(buildPreviewAiTrialStatus());
    }
    if (existing.error) {
      console.error('[api/user/ai-trial GET]', existing.error);
      return NextResponse.json({ error: 'Failed to load trial.' }, { status: 500 });
    }

    if (existing.row) {
      const bumped = await bumpExistingTrialSongsIfNeeded(admin, existing.row);
      if (bumped.error) {
        console.error('[api/user/ai-trial GET bump]', bumped.error);
      }
      const status = await loadComposedAiTrialStatus(admin, bumped.row, user.id);
      return NextResponse.json(status);
    }

    const peek = await peekUserAiTrialGrantEligibility(user, clientIp);
    if (peek.error && peek.error !== 'admin_not_configured') {
      console.error('[api/user/ai-trial GET peek]', peek.error);
      return NextResponse.json({ error: 'Failed to load trial.' }, { status: 500 });
    }

    if (!peek.eligibility.ok) {
      if (peek.eligibility.reason === 'ip_soft_cap') {
        return NextResponse.json(buildTrialIpLimitedAiTrialStatus());
      }
      if (peek.eligibility.reason === 'email_min_age') {
        return NextResponse.json(buildTrialEmailCoolingAiTrialStatus());
      }
      if (peek.eligibility.reason === 'email_unconfirmed') {
        return NextResponse.json(buildEmailUnconfirmedAiTrialStatus());
      }
      return NextResponse.json(buildTrialIpLimitedAiTrialStatus());
    }

    // クレジットのみある場合は composed 側で拾う（trial 行なし）
    const status = await loadComposedAiTrialStatus(admin, null, user.id);
    if (status.phase === 'credits_active') {
      return NextResponse.json(status);
    }

    return NextResponse.json(buildTrialEligibleAiTrialStatus());
  } catch (e) {
    console.error('[api/user/ai-trial GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
