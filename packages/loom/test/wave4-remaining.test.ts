import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { resolveAuditConfig, redactAuditRecord, emitLoomAudit } from '../src/core/audit.js';
import {
  buildExportFilename,
  parseExportFormat,
  recordsToCsv,
  recordsToJson,
} from '../src/core/export.js';
import { resolveListActions, canExport, resourceHasMediaFields } from '../src/core/list-actions.js';
import { buildLoomOpenApiSpec } from '../src/core/openapi.js';
import { buildLoomOpenApiDocsHtml } from '../src/core/openapi-docs.js';
import {
  createLocalStorageAdapter,
  decodeBase64Upload,
  validateMediaUpload,
} from '../src/core/storage.js';
import type { ResourceMeta } from '../src/core/types.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const baseMeta = {
  slug: 'tags',
  label: 'Tags',
  singularLabel: 'Tag',
  model: 'Tag',
  fields: [
    { name: 'name', type: 'text' as const },
    { name: 'avatar', type: 'image' as const, media: { maxBytes: 1024 } },
    { name: 'secret', type: 'password' as const },
  ],
  form: { sections: [] },
  columns: [{ name: 'name', type: 'text' as const, sortable: true }],
  infolist: { sections: [] },
  actions: [],
  searchableFields: ['name'],
  hasKanban: false,
  hasDetail: true,
  hasExplicitDetail: false,
  presentation: { form: 'page' as const, detail: 'page' as const },
  customPermissions: [],
} satisfies ResourceMeta;

describe('storage adapter', () => {
  it('stores and validates uploads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'loom-media-'));
    try {
      const adapter = createLocalStorageAdapter({
        disk: 'local',
        root: dir,
        publicUrlPrefix: '/admin/media',
      });
      const buffer = Buffer.from('hello');
      const stored = await adapter.store({
        buffer,
        filename: 'note.txt',
        mimeType: 'text/plain',
        directory: 'tags/file',
      });
      assert.match(stored.url, /^\/admin\/media\//);
      const onDisk = await readFile(join(dir, stored.path));
      assert.equal(onDisk.toString(), 'hello');
      validateMediaUpload({ mimeType: 'image/png', size: 100 }, {}, 'image');
      assert.throws(
        () => validateMediaUpload({ mimeType: 'text/plain', size: 100 }, {}, 'image'),
        /not allowed/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('decodes base64 uploads', () => {
    const buf = decodeBase64Upload('data:text/plain;base64,aGVsbG8=');
    assert.equal(buf.toString(), 'hello');
  });
});

describe('export helpers', () => {
  it('serializes csv and json', () => {
    const rows = [{ name: 'A', id: '1' }];
    assert.match(recordsToCsv(rows, [{ name: 'name' }]), /name/);
    assert.match(recordsToJson(rows), /"A"/);
    assert.equal(parseExportFormat('json'), 'json');
    assert.equal(buildExportFilename('tags', 'csv'), 'tags-' + new Date().toISOString().slice(0, 10) + '.csv');
  });
});

describe('audit', () => {
  it('redacts password fields', () => {
    const redacted = redactAuditRecord(
      { name: 'x', secret: 'hidden' },
      baseMeta.fields,
    );
    assert.equal(redacted?.name, 'x');
    assert.equal(redacted?.secret, undefined);
  });

  it('calls onAudit once', async () => {
    const events: string[] = [];
    const config = resolveAuditConfig({
      onAudit: (event) => events.push(event.action),
    });
    await emitLoomAudit(config, { action: 'create', resource: 'tags' });
    await emitLoomAudit(config, { action: 'create', resource: 'tags' });
    assert.deepEqual(events, ['create', 'create']);
  });
});

describe('list actions', () => {
  it('adds default export, import and bulk delete actions', () => {
    const resolved = resolveListActions(baseMeta, '/admin', null, false, {
      canDelete: true,
      canViewAny: true,
      canView: true,
      canEdit: true,
      canCreate: true,
    });
    assert.ok(resolved.headerActions.some((action) => action.name === 'export'));
    assert.ok(resolved.headerActions.some((action) => action.name === 'import'));
    assert.ok(resolved.bulkActions.some((action) => action.name === 'delete'));
    assert.ok(Array.isArray(resolved.recordActions));
    assert.equal(resourceHasMediaFields(baseMeta), true);
  });

  it('checks export permission', () => {
    assert.equal(
      canExport(
        { id: '1', name: 'A', email: 'a@b.c', permissions: ['tags:export'] },
        true,
        'tags',
        false,
      ),
      true,
    );
  });
});

describe('openapi', () => {
  it('builds resource paths', () => {
    const spec = buildLoomOpenApiSpec({
      title: 'Loom',
      apiPrefix: 'api/loom/v1',
      version: 'v1',
      resources: [baseMeta],
    });
    const paths = spec.paths as Record<string, unknown>;
    assert.ok(paths['/api/loom/v1/tags']);
    assert.ok(paths['/api/loom/v1/tags/export']);
    assert.ok(paths['/api/loom/v1/docs']);
    assert.ok(paths['/api/loom/v1/redoc']);
  });
});

describe('openapi docs html', () => {
  it('embeds swagger ui with absolute asset and spec urls', () => {
    const html = buildLoomOpenApiDocsHtml({
      title: 'CRM',
      specUrl: '/api/loom/v1/openapi.json',
      docsBasePath: '/api/loom/v1/docs',
      ui: 'swagger',
      csrfCookieName: 'loom_csrf',
    });
    assert.match(html, /CRM — API docs/);
    assert.match(html, /\/api\/loom\/v1\/openapi\.json/);
    assert.match(html, /\/api\/loom\/v1\/docs\/swagger-ui-bundle\.js/);
    assert.match(html, /\/api\/loom\/v1\/docs\/swagger-ui\.css/);
    assert.match(html, /X-CSRF-Token/);
    assert.match(html, /loom_csrf/);
  });

  it('embeds redoc with absolute asset and spec urls', () => {
    const html = buildLoomOpenApiDocsHtml({
      title: 'CRM',
      specUrl: '/api/loom/v1/openapi.json',
      docsBasePath: '/api/loom/v1/redoc',
      ui: 'redoc',
    });
    assert.match(html, /<redoc spec-url="\/api\/loom\/v1\/openapi\.json">/);
    assert.match(html, /\/api\/loom\/v1\/redoc\/redoc\.standalone\.js/);
  });
});
