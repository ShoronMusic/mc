import type Ably from 'ably';

let activeClient: Ably.Realtime | null = null;

/**
 * 部屋用 Ably クライアントの参照を記録する。
 *
 * アンマウント時に client.close() は呼ばない。Ably の close は内部で
 * Connection closed（80017）を投げ、Next.js 開発オーバーレイに出るため。
 * 同一 clientId での再入室は Ably が旧接続を置き換える。タブを閉じるときは
 * closeOnUnload で Ably 側が処理する。
 */
export function registerActiveAblyClient(client: Ably.Realtime): void {
  activeClient = client;
}

export function unregisterActiveAblyClient(client: Ably.Realtime): void {
  if (activeClient === client) activeClient = null;
}
