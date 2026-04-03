/**
 * ハンドル未入力のゲスト用。同一表示名の重複を減らす（連番ではなく端末上の乱数）。
 */
export function assignDefaultGuestDisplayName(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const n = 1000 + (buf[0]! % 9000);
    return `ゲスト${n}`;
  }
  return `ゲスト${1000 + Math.floor(Math.random() * 9000)}`;
}
