/**
 * 開発用: `.env.local` に `NEXT_PUBLIC_DEV_MOCK_ACTIVE_ROOMS=12` のように数値を置くと、
 * トップの「開催中の部屋（参加中）」一覧を疑似的に表示する（API・Ably 不要）。
 * UI 確認専用。本番では未設定のままにすること。
 */

export type DevMockLiveRoom = {
  roomId: string;
  title: string;
  startedAt: string | null;
  displayTitle?: string;
  joinLocked?: boolean;
  canEnter?: boolean;
  hostDisplayName?: string | null;
};

export type DevMockRoomPayload = {
  roomId: string;
  count: number;
  names: string[];
  lobbyMessage?: string;
  jpAiUnlockEnabled?: boolean;
};

export type DevMockActiveRoomsData = {
  liveRooms: DevMockLiveRoom[];
  byId: Record<string, DevMockRoomPayload>;
};

const MOCK_TITLE_TEMPLATES = [
  '80年代ロック縛りナイト',
  'シティポップおすすめ交換',
  '新曲 discovery ゆる会',
  '懐メロ洋楽たっぷり',
  '邦楽解禁お試しルーム',
  'ブリットポップ縛り',
  'カフェBGMのような穏やかな洋楽をゆっくり聴く会',
  'R&B とソウルの夜',
  'インディー洋楽発掘',
  '同期視聴で語ろう',
] as const;

const MOCK_HOSTS = [
  'たなか',
  'music_lover',
  'vinyl_cat',
  '洋楽好き太郎',
  'night_owl',
  'jazz_piano',
  'rock_fan_42',
  'soul_sister',
] as const;

const MOCK_PARTICIPANT_POOL = [
  'あきら',
  'ゆき',
  'Ken',
  'Mio',
  'Chris',
  'さくら',
  'Dave',
  'ルナ',
  'Tom',
  'はるか',
  'Alex',
  'みどり',
  'Sam',
  'のり',
  'Emma',
] as const;

const MOCK_LOBBY_MESSAGES = [
  '初めての方もお気軽にどうぞ',
  '今週のお題: 1985年の名曲',
  '邦楽OK・ゆるく語り合いましょう',
  '音量注意でゆったりどうぞ',
] as const;

const MAX_MOCK_ROOMS = 50;

export function getDevMockActiveRoomsCount(): number {
  const raw = process.env.NEXT_PUBLIC_DEV_MOCK_ACTIVE_ROOMS?.trim();
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_MOCK_ROOMS);
}

export function isDevMockActiveRoomsEnabled(): boolean {
  return getDevMockActiveRoomsCount() > 0;
}

function pickNames(index: number, count: number): string[] {
  const start = index % MOCK_PARTICIPANT_POOL.length;
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    names.push(MOCK_PARTICIPANT_POOL[(start + i) % MOCK_PARTICIPANT_POOL.length]);
  }
  return names;
}

export function buildDevMockActiveRoomsData(count: number): DevMockActiveRoomsData {
  const safeCount = Math.min(Math.max(1, count), MAX_MOCK_ROOMS);
  const liveRooms: DevMockLiveRoom[] = [];
  const byId: Record<string, DevMockRoomPayload> = {};

  for (let i = 0; i < safeCount; i += 1) {
    const roomId = `mock-${String(i + 1).padStart(2, '0')}`;
    const title = MOCK_TITLE_TEMPLATES[i % MOCK_TITLE_TEMPLATES.length];
    const host = MOCK_HOSTS[i % MOCK_HOSTS.length];
    const joinLocked = i % 5 === 4;
    const canEnter = joinLocked ? i % 10 !== 4 : true;
    const participantCount = 1 + ((i * 3) % 12);
    const names = pickNames(i, participantCount);

    liveRooms.push({
      roomId,
      title,
      displayTitle: i % 4 === 0 ? `${title}（${host}主催）` : title,
      startedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
      hostDisplayName: host,
      joinLocked,
      canEnter,
    });

    byId[roomId] = {
      roomId,
      count: participantCount,
      names,
      jpAiUnlockEnabled: i % 7 === 3,
      lobbyMessage: i % 3 === 1 ? MOCK_LOBBY_MESSAGES[i % MOCK_LOBBY_MESSAGES.length] : undefined,
    };
  }

  return { liveRooms, byId };
}
