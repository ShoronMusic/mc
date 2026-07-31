import assert from 'node:assert/strict';
import {
  checkAiTrialEmailMinAge,
  normalizeAiTrialIpKey,
  trialFirstIpMatchesKey,
} from '@/lib/ai-trial-abuse-guard';
import type { User } from '@supabase/supabase-js';

assert.equal(normalizeAiTrialIpKey('203.0.113.45'), '203.0.113.');
assert.equal(normalizeAiTrialIpKey('  10.0.0.1 '), '10.0.0.');
assert.equal(normalizeAiTrialIpKey('unknown'), null);
assert.equal(normalizeAiTrialIpKey(''), null);
assert.equal(normalizeAiTrialIpKey('2001:db8::1'), '2001:db8::1');

assert.equal(trialFirstIpMatchesKey('203.0.113.9', '203.0.113.'), true);
assert.equal(trialFirstIpMatchesKey('203.0.114.9', '203.0.113.'), false);
assert.equal(trialFirstIpMatchesKey('2001:db8::1', '2001:db8::1'), true);

function fakeUser(params: {
  id: string;
  emailConfirmedAt?: string;
  providers: string[];
}): User {
  return {
    id: params.id,
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    app_metadata: { provider: params.providers[0] },
    user_metadata: {},
    email_confirmed_at: params.emailConfirmedAt,
    identities: params.providers.map((provider, i) => ({
      id: `${provider}-${i}`,
      user_id: params.id,
      identity_id: `${provider}-${i}`,
      provider,
      identity_data: {},
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  } as User;
}

const oauthUser = fakeUser({
  id: 'u-oauth',
  emailConfirmedAt: new Date().toISOString(),
  providers: ['google'],
});
assert.equal(checkAiTrialEmailMinAge(oauthUser).ok, true);

const prevMin = process.env.AI_TRIAL_EMAIL_GRANT_MIN_AGE_MINUTES;
process.env.AI_TRIAL_EMAIL_GRANT_MIN_AGE_MINUTES = '15';

const emailUserFresh = fakeUser({
  id: 'u-email',
  emailConfirmedAt: new Date().toISOString(),
  providers: ['email'],
});
const cooling = checkAiTrialEmailMinAge(emailUserFresh);
assert.equal(cooling.ok, false);
if (!cooling.ok) {
  assert.equal(cooling.reason, 'email_min_age');
}

const emailUserAged = fakeUser({
  id: 'u-email-aged',
  emailConfirmedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  providers: ['email'],
});
assert.equal(checkAiTrialEmailMinAge(emailUserAged).ok, true);

if (prevMin === undefined) delete process.env.AI_TRIAL_EMAIL_GRANT_MIN_AGE_MINUTES;
else process.env.AI_TRIAL_EMAIL_GRANT_MIN_AGE_MINUTES = prevMin;

console.log('ai-trial-abuse-guard.unit-test: ok');
