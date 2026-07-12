import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCsrfCookie,
  createCsrfToken,
  parseSignedCsrfToken,
  signCsrfToken,
  tokensMatch,
} from '../src/core/csrf.js';
import { signSession, verifySession } from '../src/core/auth.js';

describe('CSRF tokens', () => {
  it('signs and parses CSRF cookies', () => {
    const raw = createCsrfToken();
    const signed = signCsrfToken(raw, 'secret');
    assert.equal(parseSignedCsrfToken(signed, 'secret'), raw);
    assert.equal(parseSignedCsrfToken(signed, 'other'), null);
  });

  it('matches submitted tokens safely', () => {
    assert.equal(tokensMatch('abc', 'abc'), true);
    assert.equal(tokensMatch('abc', 'abd'), false);
    assert.equal(tokensMatch(undefined, 'abc'), false);
  });

  it('builds CSRF clear cookie', () => {
    const cookie = buildCsrfCookie({ secret: 'x' }, null);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /Path=\//);
  });
});

describe('session version in token', () => {
  it('embeds and verifies sv', () => {
    const token = signSession(
      { sub: 'u1', exp: Date.now() + 60_000, sv: 3 },
      'secret',
    );
    const payload = verifySession(token, 'secret');
    assert.equal(payload?.sv, 3);
  });
});
