import type { Channel, PresenceMessage } from 'ably';

const PRESENCE_PAGE_MAX = 50;

export async function allPresenceMembers(channel: Channel): Promise<PresenceMessage[]> {
  const out: PresenceMessage[] = [];
  let page = await channel.presence.get();
  out.push(...page.items);
  let guard = 0;
  while (page.hasNext() && guard < PRESENCE_PAGE_MAX) {
    guard += 1;
    const next = await page.next();
    if (!next) break;
    page = next;
    out.push(...page.items);
  }
  return out;
}
