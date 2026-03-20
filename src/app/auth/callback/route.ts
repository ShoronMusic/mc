import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description') ?? '';
  let next = searchParams.get('next') ?? '/';
  if (!next.startsWith('/')) next = '/';

  if (error) {
    const isStateExpired = error === 'invalid_request' && errorDescription.includes('expired');
    const message = isStateExpired
      ? 'state_expired'
      : encodeURIComponent(errorDescription || error);
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('auth_error', message);
    return NextResponse.redirect(redirectUrl);
  }

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
