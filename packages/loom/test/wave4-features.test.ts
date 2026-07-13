import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { assertLoomDeprecations } from '../src/core/assert-options.js';
import {
  resetLoomDeprecationWarnings,
  warnLoomDeprecated,
} from '../src/core/deprecation.js';
import {
  applyLoomSecurityHeaders,
  buildLoomSecurityHeaders,
  defaultLoomContentSecurityPolicy,
  resolveSecurityHeadersConfig,
} from '../src/core/security-headers.js';

describe('resolveSecurityHeadersConfig', () => {
  it('returns null when disabled or omitted', () => {
    assert.equal(resolveSecurityHeadersConfig(undefined), null);
    assert.equal(resolveSecurityHeadersConfig(false), null);
    assert.equal(resolveSecurityHeadersConfig({ enabled: false }), null);
  });

  it('enables defaults when true', () => {
    assert.deepEqual(resolveSecurityHeadersConfig(true), { enabled: true });
  });
});

describe('buildLoomSecurityHeaders', () => {
  it('includes baseline headers and default CSP', () => {
    const headers = buildLoomSecurityHeaders({ enabled: true });
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /unsafe-inline/);
    assert.match(headers['Content-Security-Policy'], /unsafe-eval/);
    assert.equal(headers['Content-Security-Policy'].includes('cdn.jsdelivr.net'), false);
  });

  it('supports report-only CSP and custom overrides', () => {
    const headers = buildLoomSecurityHeaders({
      enabled: true,
      contentSecurityPolicy: "default-src 'self'",
      contentSecurityPolicyReportOnly: true,
      headers: { 'X-Frame-Options': false, 'X-Custom': 'yes' },
    });
    assert.equal(headers['Content-Security-Policy'], undefined);
    assert.equal(headers['Content-Security-Policy-Report-Only'], "default-src 'self'");
    assert.equal(headers['X-Frame-Options'], undefined);
    assert.equal(headers['X-Custom'], 'yes');
  });

  it('adds font host to style-src when branding fontUrl is set', () => {
    const csp = defaultLoomContentSecurityPolicy({
      fontUrl: 'https://fonts.example.com/css?family=Inter',
    });
    assert.match(csp, /fonts\.example\.com/);
  });
});

describe('applyLoomSecurityHeaders', () => {
  it('sets headers on a response-like object', () => {
    const set = new Map<string, string>();
    applyLoomSecurityHeaders(
      {
        setHeader(name, value) {
          set.set(name, value);
        },
      },
      { enabled: true },
    );
    assert.ok(set.has('Content-Security-Policy'));
    assert.equal(set.get('X-Content-Type-Options'), 'nosniff');
  });
});

describe('assertLoomDeprecations', () => {
  beforeEach(() => {
    resetLoomDeprecationWarnings();
    process.env.LOOM_DEPRECATION_WARNINGS = '0';
  });

  it('warns once for deprecated module options', () => {
    const messages: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => messages.push(msg);
    delete process.env.LOOM_DEPRECATION_WARNINGS;
    try {
      assertLoomDeprecations({ resources: [], title: 'Old' });
      assertLoomDeprecations({ resources: [], title: 'Old' });
      assertLoomDeprecations({
        resources: [],
        auth: { secret: 'x', roleField: 'legacyRole' },
      });
      assert.equal(messages.length, 2);
      assert.match(messages[0], /title/);
      assert.match(messages[1], /roleField/);
    } finally {
      console.warn = original;
      process.env.LOOM_DEPRECATION_WARNINGS = '0';
    }
  });
});

describe('warnLoomDeprecated', () => {
  beforeEach(() => {
    resetLoomDeprecationWarnings();
  });

  it('respects LOOM_DEPRECATION_WARNINGS=0', () => {
    process.env.LOOM_DEPRECATION_WARNINGS = '0';
    const messages: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => messages.push(msg);
    try {
      warnLoomDeprecated('test-key', 'quiet');
      assert.equal(messages.length, 0);
    } finally {
      console.warn = original;
      delete process.env.LOOM_DEPRECATION_WARNINGS;
    }
  });
});
