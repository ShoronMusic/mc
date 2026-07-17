import assert from 'node:assert/strict';
import {
  buildOAuthCallbackRedirectTo,
  safeOauthNextPath,
} from './oauth-return-path';

assert.equal(safeOauthNextPath('/'), '/');
assert.equal(safeOauthNextPath('/01'), '/01');
assert.equal(safeOauthNextPath('%2F01'), '/01');
assert.equal(safeOauthNextPath('//evil.com'), null);
assert.equal(safeOauthNextPath('/auth/update-password'), null);

assert.equal(
  buildOAuthCallbackRedirectTo('https://www.musicchat.jp'),
  'https://www.musicchat.jp/auth/callback',
);
assert.equal(
  buildOAuthCallbackRedirectTo('https://www.musicchat.jp/'),
  'https://www.musicchat.jp/auth/callback',
);
assert.equal(
  buildOAuthCallbackRedirectTo('http://localhost:3003'),
  'http://localhost:3003/auth/callback',
);

console.log('oauth-return-path.unit-test.ts: ok');
