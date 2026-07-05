import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  getMiddlewareSupabaseAuthTimeoutMs,
  shouldSkipSupabaseMiddlewareAuthRefresh,
} from '@/lib/supabase/middleware';

const prev = process.env.MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS;

delete process.env.MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS;
assert.equal(getMiddlewareSupabaseAuthTimeoutMs(), 4_000);

process.env.MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS = '8000';
assert.equal(getMiddlewareSupabaseAuthTimeoutMs(), 8_000);

const noAuth = new NextRequest('https://example.com/');
assert.equal(shouldSkipSupabaseMiddlewareAuthRefresh(noAuth), true);

const withAuth = new NextRequest('https://example.com/', {
  headers: { cookie: 'sb-test-auth-token=abc' },
});
assert.equal(shouldSkipSupabaseMiddlewareAuthRefresh(withAuth), false);

if (prev === undefined) delete process.env.MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS;
else process.env.MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS = prev;

console.log('supabase/middleware.unit-test: ok');
