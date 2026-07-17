/**
 * `npx tsx src/lib/safe-outbound-url.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { assertSafeOutboundUrl } from './safe-outbound-url';

assert.equal(assertSafeOutboundUrl('https://storage.googleapis.com/x.json').ok, true);
assert.equal(assertSafeOutboundUrl('http://example.com/a').ok, false);
assert.equal(assertSafeOutboundUrl('https://127.0.0.1/x').ok, false);
assert.equal(assertSafeOutboundUrl('https://169.254.169.254/latest').ok, false);
assert.equal(assertSafeOutboundUrl('https://10.0.0.1/x').ok, false);
assert.equal(assertSafeOutboundUrl('https://192.168.1.1/x').ok, false);
assert.equal(
  assertSafeOutboundUrl('https://evil.example/x', { allowedHosts: ['storage.googleapis.com'] }).ok,
  false,
);
assert.equal(
  assertSafeOutboundUrl('https://storage.googleapis.com/x', {
    allowedHosts: ['storage.googleapis.com'],
  }).ok,
  true,
);

console.log('safe-outbound-url unit tests: OK');
