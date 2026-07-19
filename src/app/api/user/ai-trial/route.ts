import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAiUnlimitedRole } from '@/lib/ai-unlimited-user-ids';
import {
  buildDeveloperUnlimitedAiTrialStatus,
  buildEmailUnconfirmedAiTrialStatus,
  buildPreviewAiTrialStatus,
  buildSupporterUnlimitedAiTrialStatus,
  isAiTrialEnforcementEnabled,
} from '@/lib/ai-trial-status';
import { requiresEmailConfirmation } from '@/lib/supabase-email-auth';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import {
  ensureUserAiTrialGrant,
  rowToAiTrialStatus,
} from '@/lib/user-ai-trial-server';
import { loadComposedAiTrialStatus } from '@/lib/user-ai-credits-server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET: ログインユーザーの AI お試し残数。確認済みで行なし → 付与 */
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

    const grant = await ensureUserAiTrialGrant(user, clientIp);
    if (grant.missingTable) {
      return NextResponse.json(buildPreviewAiTrialStatus());
    }
    if (grant.error || !grant.row) {
      console.error('[api/user/ai-trial GET grant]', grant.error);
      return NextResponse.json({ error: 'Failed to grant trial.' }, { status: 500 });
    }

    const row = grant.row;
    const admin = createAdminClient();

    if (!admin) {
      return NextResponse.json(rowToAiTrialStatus(row));
    }

    const status = await loadComposedAiTrialStatus(admin, row, user.id);
    return NextResponse.json(status);
  } catch (e) {
    console.error('[api/user/ai-trial GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
