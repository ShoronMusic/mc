/**
 * `npx tsx src/lib/supabase/peek-browser-auth.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  hasSupabaseAuthTokenInCookieHeader,
  hasSupabaseAuthTokenInStorageKeys,
} from './peek-browser-auth';

assert.equal(hasSupabaseAuthTokenInCookieHeader(''), false);
assert.equal(hasSupabaseAuthTokenInCookieHeader('theme=dark'), false);
assert.equal(hasSupabaseAuthTokenInCookieHeader('sb-xxxx-auth-token=abc'), true);
assert.equal(hasSupabaseAuthTokenInCookieHeader('foo=1; sb-proj-auth-token.0=chunk'), true);
assert.equal(hasSupabaseAuthTokenInCookieHeader('mc_oauth_next=/01'), false);

assert.equal(hasSupabaseAuthTokenInStorageKeys([]), false);
assert.equal(hasSupabaseAuthTokenInStorageKeys(['theme']), false);
assert.equal(hasSupabaseAuthTokenInStorageKeys(['sb-xxxx-auth-token']), true);
assert.equal(hasSupabaseAuthTokenInStorageKeys(['sb-xxxx-auth-token.0']), true);

console.log('peek-browser-auth.unit-test.ts: ok');
