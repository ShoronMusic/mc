const TRIAL_ROOM_START = 91;
const TRIAL_ROOM_COUNT = 10;

export const TRIAL_ROOM_IDS: string[] = Array.from({ length: TRIAL_ROOM_COUNT }, (_, i) =>
  String(TRIAL_ROOM_START + i),
);

const TRIAL_ROOM_SET = new Set(TRIAL_ROOM_IDS);

export function isTrialRoomId(roomId: string): boolean {
  return TRIAL_ROOM_SET.has(roomId.trim());
}

export function pickTrialRoomId(seed: number = Date.now()): string {
  const index = Math.abs(seed) % TRIAL_ROOM_IDS.length;
  return TRIAL_ROOM_IDS[index] ?? TRIAL_ROOM_IDS[0] ?? '90';
}

