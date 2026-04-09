import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gatherUserTasteSignalsForAutoProfile } from '@/lib/gather-user-taste-signals';
import { generateUserTasteAutoProfile } from '@/lib/gemini';
import { USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS } from '@/lib/user-ai-taste-auto-profile';

export const dynamic = 'force-dynamic';

/** 連打で Gemini を消費しない */
const MIN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
const MIN_SIGNAL_CHARS = 60;

export async function POST() {
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
    const userId = user.id;

    const { data: existing, error: loadErr } = await supabase
      .from('user_ai_taste_auto_profile')
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (loadErr && loadErr.code !== '42P01') {
      console.error('[api/user/ai-taste-auto-refresh] load', loadErr);
      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
    }

    if (loadErr?.code === '42P01') {
      return NextResponse.json(
        {
          error: 'user_ai_taste_auto_profile テーブルがありません。',
          hint: 'docs/supabase-setup.md 第 15 章の SQL を実行してください。',
        },
        { status: 503 },
      );
    }

    const lastAt = existing?.updated_at ? new Date(String(existing.updated_at)).getTime() : 0;
    if (Number.isFinite(lastAt) && lastAt > 0 && Date.now() - lastAt < MIN_REFRESH_INTERVAL_MS) {
      const retryAfterSec = Math.ceil((MIN_REFRESH_INTERVAL_MS - (Date.now() - lastAt)) / 1000);
      return NextResponse.json(
        {
          error: 'rate_limit',
          message: '自動要約の更新はしばらく空けてからお試しください。',
          retryAfterSec,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      );
    }

    const signals = await gatherUserTasteSignalsForAutoProfile(supabase, userId);
    if (signals.length < MIN_SIGNAL_CHARS) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'insufficient_signals',
      });
    }

    const profile = await generateUserTasteAutoProfile(signals, { roomId: null, videoId: null });
    if (!profile?.trim()) {
      return NextResponse.json(
        { error: '要約を生成できませんでした。しばらくしてから再度お試しください。' },
        { status: 503 },
      );
    }

    let text = profile.trim();
    if (text.length > USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS) {
      text = text.slice(0, USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS - 1) + '…';
    }

    const { error: upsertErr } = await supabase.from('user_ai_taste_auto_profile').upsert(
      {
        user_id: userId,
        profile_text: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertErr) {
      if (upsertErr.code === '42P01') {
        return NextResponse.json(
          {
            error: 'user_ai_taste_auto_profile テーブルがありません。',
            hint: 'docs/supabase-setup.md 第 15 章の SQL を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[api/user/ai-taste-auto-refresh] upsert', upsertErr);
      return NextResponse.json({ error: '保存に失敗しました。' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, skipped: false, length: text.length });
  } catch (e) {
    console.error('[api/user/ai-taste-auto-refresh]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
