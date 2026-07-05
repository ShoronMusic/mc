import type Ably from 'ably';
import { unregisterActiveAblyClient } from '@/lib/ably-client-safe';

/** 意図的な裏タブ切断など。アンマウント時の close は従来どおり呼ばない */
export function closeAblyClientSafely(client: Ably.Realtime | null | undefined): void {
  if (!client) return;
  try {
    client.close();
  } catch {
    /* ignore */
  }
  unregisterActiveAblyClient(client);
}
