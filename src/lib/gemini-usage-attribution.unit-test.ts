import {
  getGeminiUsageAttributionRule,
  resolveGeminiBillingUserId,
  resolveGeminiUsageBillingKind,
} from '@/lib/gemini-usage-attribution';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  getGeminiUsageAttributionRule('tidbit').billingKind === 'room_owner',
  'tidbit -> room_owner',
);
assert(
  getGeminiUsageAttributionRule('character_song_pick').billingKind === 'ai_agent',
  'character_song_pick -> ai_agent',
);
assert(
  resolveGeminiUsageBillingKind('chat_reply', { isGuestTrigger: true }) === 'guest_enjoy_owner_paid',
  'guest chat -> guest_enjoy_owner_paid',
);
assert(
  resolveGeminiUsageBillingKind('chat_reply', { isGuestTrigger: false }) === 'participant_user',
  'member chat -> participant_user',
);
assert(
  resolveGeminiBillingUserId({
    billingKind: 'participant_user',
    triggerUserId: 'u1',
    ownerUserId: 'owner1',
  }) === 'u1',
  'participant billing user',
);
assert(
  resolveGeminiBillingUserId({
    billingKind: 'guest_enjoy_owner_paid',
    triggerUserId: null,
    ownerUserId: 'owner1',
  }) === 'owner1',
  'guest enjoy -> owner',
);

console.log('gemini-usage-attribution unit tests: OK');
