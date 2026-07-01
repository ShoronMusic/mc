import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildEmailUnconfirmedAiTrialStatus,
  buildPreviewAiTrialStatus,
  isAiTrialEnforcementEnabled,
} from '@/lib/ai-trial-status';
import { requiresEmailConfirmation } from '@/lib/supabase-email-auth';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import {
  ensureUserAiTrialGrant,
  fetchUserAiTrialRow,
  rowToAiTrialStatus,
} from '@/lib/user-ai-trial-server';
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

    if (requiresEmailConfirmation(user)) {
      return NextResponse.json(buildEmailUnconfirmedAiTrialStatus());
    }

    if (!isAiTrialEnforcementEnabled()) {
      return NextResponse.json(buildPreviewAiTrialStatus());
    }

    const clientIp = getChatAiClientIp(request);
    const admin = createAdminClient();
    const reader = admin ?? supabase;

    let { row, error, missingTable } = await fetchUserAiTrialRow(reader, user.id);
    if (missingTable) {
      return NextResponse.json(buildPreviewAiTrialStatus());
    }
    if (error) {
      console.error('[api/user/ai-trial GET]', error);
      return NextResponse.json({ error: 'Failed to load.' }, { status: 500 });
    }

    if (!row) {
      const grant = await ensureUserAiTrialGrant(user, clientIp);
      if (grant.missingTable) {
        return NextResponse.json(buildPreviewAiTrialStatus());
      }
      if (grant.error || !grant.row) {
        console.error('[api/user/ai-trial GET grant]', grant.error);
        return NextResponse.json({ error: 'Failed to grant trial.' }, { status: 500 });
      }
      row = grant.row;
    }

    return NextResponse.json(rowToAiTrialStatus(row));
  } catch (e) {
    console.error('[api/user/ai-trial GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
