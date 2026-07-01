import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import {
  buildEmailConfirmRedirectUrl,
  isEmailPasswordUser,
  isUserEmailConfirmed,
  requiresEmailConfirmation,
  safeAuthNextPath,
} from '@/lib/supabase-email-auth';

function user(partial: Partial<User> & Pick<User, 'id'>): User {
  return {
    aud: 'authenticated',
    created_at: '',
    app_metadata: {},
    user_metadata: {},
    ...partial,
  } as User;
}

assert.equal(safeAuthNextPath('/01'), '/01');
assert.equal(safeAuthNextPath('//evil'), '/');
assert.equal(safeAuthNextPath(null), '/');

assert.equal(
  buildEmailConfirmRedirectUrl('/01', 'http://localhost:3002'),
  'http://localhost:3002/auth/callback?next=%2F01&flow=email_confirm',
);

assert.equal(isUserEmailConfirmed(user({ id: '1', email_confirmed_at: '2026-01-01' })), true);
assert.equal(isUserEmailConfirmed(user({ id: '1' })), false);

const emailOnly = user({
  id: '2',
  identities: [{ provider: 'email', id: 'e', identity_id: 'e', user_id: '2', identity_data: {} }],
});
assert.equal(isEmailPasswordUser(emailOnly), true);
assert.equal(requiresEmailConfirmation(emailOnly), true);

const googleUser = user({
  id: '3',
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'google', id: 'g', identity_id: 'g', user_id: '3', identity_data: {} }],
});
assert.equal(requiresEmailConfirmation(googleUser), false);

console.log('supabase-email-auth.unit-test: ok');
