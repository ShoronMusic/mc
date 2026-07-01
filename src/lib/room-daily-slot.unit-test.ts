import {
  dailySlotEndMs,
  dailySlotKey,
  dailySlotStartMs,
  enumerateDailySlotStarts,
  isoInDailySlot,
  parseDailySlotKey,
} from './room-daily-slot';

const daySlot = new Date('2026-06-29T10:00:00+09:00').getTime();
const nightSlot = new Date('2026-06-29T22:00:00+09:00').getTime();
const earlyMorning = new Date('2026-06-30T03:00:00+09:00').getTime();

const dayStart = dailySlotStartMs(new Date(daySlot));
const nightStart = dailySlotStartMs(new Date(nightSlot));
const earlyStart = dailySlotStartMs(new Date(earlyMorning));

const ok =
  dayStart === new Date('2026-06-29T06:00:00+09:00').getTime() &&
  nightStart === new Date('2026-06-29T18:00:00+09:00').getTime() &&
  earlyStart === new Date('2026-06-29T18:00:00+09:00').getTime() &&
  dailySlotEndMs(dayStart) === dayStart + 12 * 60 * 60 * 1000 &&
  dailySlotKey('02', dayStart) === `${dayStart}::02` &&
  parseDailySlotKey(`${dayStart}::02`)?.roomId === '02' &&
  parseDailySlotKey(`${dayStart}::02`)?.slotStartMs === dayStart &&
  parseDailySlotKey('bad') === null &&
  isoInDailySlot('2026-06-29T10:00:00+09:00', dayStart) &&
  !isoInDailySlot('2026-06-29T19:00:00+09:00', dayStart) &&
  enumerateDailySlotStarts(dayStart, dayStart + 1).length === 1 &&
  enumerateDailySlotStarts(dayStart, nightStart + 1).length >= 2;

if (!ok) {
  console.error('room-daily-slot unit tests: FAILED', {
    dayStart,
    nightStart,
    earlyStart,
  });
  process.exit(1);
}
console.log('room-daily-slot unit tests: OK');
