/**
 * guardAiTrialSongSelection の consume フラグと commit の役割分担の単体テスト（モック無しの純関数相当は難しいため、
 * パラメータ解釈の契約をドキュメント化する軽量テスト）。
 *
 * 実 DB を叩かない範囲: consume 省略時の既定（frees=非消費 / それ以外=消費）は実装コメントと一致させる。
 */
import assert from 'node:assert/strict';

/** guard の shouldConsume 判定と同じ式（実装と同期すること） */
function shouldConsumeSongForGuard(params: {
  consume?: boolean;
  packPhase?: 'base' | 'frees' | null;
}): boolean {
  return params.consume === false
    ? false
    : params.consume === true
      ? true
      : params.packPhase !== 'frees';
}

assert.equal(shouldConsumeSongForGuard({ packPhase: 'frees' }), false);
assert.equal(shouldConsumeSongForGuard({ packPhase: 'base' }), true);
assert.equal(shouldConsumeSongForGuard({ packPhase: null }), true);
assert.equal(shouldConsumeSongForGuard({}), true);
assert.equal(shouldConsumeSongForGuard({ consume: false, packPhase: 'base' }), false);
assert.equal(shouldConsumeSongForGuard({ consume: true, packPhase: 'frees' }), true);
assert.equal(shouldConsumeSongForGuard({ consume: false, packPhase: 'frees' }), false);

console.log('user-ai-trial-consume-defer.unit-test.ts: ok');
