import type { ResourceMeta } from './types.js';

export interface LoomOpenApiOptions {
  title: string;
  apiPrefix: string;
  version?: string;
  resources: ResourceMeta[];
}

export function buildLoomOpenApiSpec(options: LoomOpenApiOptions): Record<string, unknown> {
  const apiVersion = options.version ?? 'v1';
  const basePath = `/${options.apiPrefix.replace(/^\//, '')}`;
  const paths: Record<string, unknown> = {
    [`${basePath}/me`]: {
      get: { summary: 'Current session user', tags: ['Auth'], responses: { '200': { description: 'OK' } } },
    },
    [`${basePath}/resources`]: {
      get: { summary: 'List accessible resources', tags: ['Discovery'], responses: { '200': { description: 'OK' } } },
    },
    [`${basePath}/login`]: {
      post: {
        summary: 'Sign in',
        tags: ['Auth'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } },
      },
    },
    [`${basePath}/logout`]: {
      post: { summary: 'Sign out', tags: ['Auth'], responses: { '200': { description: 'OK' } } },
    },
    [`${basePath}/openapi.json`]: {
      get: { summary: 'OpenAPI document', tags: ['Discovery'], responses: { '200': { description: 'OK' } } },
    },
    [`${basePath}/docs`]: {
      get: {
        summary: 'Interactive API docs (Swagger UI)',
        tags: ['Discovery'],
        responses: { '200': { description: 'HTML' } },
      },
    },
    [`${basePath}/redoc`]: {
      get: {
        summary: 'Interactive API docs (Redoc)',
        tags: ['Discovery'],
        responses: { '200': { description: 'HTML' } },
      },
    },
  };

  for (const meta of options.resources) {
    const tag = meta.label;
    const collection = `${basePath}/${meta.slug}`;
    const item = `${collection}/{id}`;
    const recordSchema = resourceRecordSchema(meta);

    paths[collection] = {
      get: {
        summary: `List ${meta.label}`,
        tags: [tag],
        parameters: listParameters(),
        responses: { '200': { description: 'Paginated list' } },
      },
      post: {
        summary: `Create ${meta.singularLabel}`,
        tags: [tag],
        requestBody: { content: { 'application/json': { schema: recordSchema } } },
        responses: { '201': { description: 'Created' } },
      },
    };
    paths[item] = {
      get: {
        summary: `Show ${meta.singularLabel}`,
        tags: [tag],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
      put: {
        summary: `Replace ${meta.singularLabel}`,
        tags: [tag],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: recordSchema } } },
        responses: { '200': { description: 'OK' } },
      },
      patch: {
        summary: `Update ${meta.singularLabel}`,
        tags: [tag],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: recordSchema } } },
        responses: { '200': { description: 'OK' } },
      },
      delete: {
        summary: `Delete ${meta.singularLabel}`,
        tags: [tag],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    };
    paths[`${collection}/export`] = {
      get: {
        summary: `Export ${meta.label}`,
        tags: [tag],
        parameters: [
          ...listParameters(),
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'] } },
        ],
        responses: { '200': { description: 'CSV or JSON export' } },
      },
    };
    paths[`${collection}/import`] = {
      post: {
        summary: `Import ${meta.label}`,
        tags: [tag],
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: { csv: { type: 'string' } },
                required: ['csv'],
              },
            },
          },
        },
        responses: { '200': { description: 'Import result' } },
      },
    };
    paths[`${collection}/bulk`] = {
      post: {
        summary: `Bulk action on ${meta.label}`,
        tags: [tag],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['delete'] },
                  ids: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    };
    paths[`${collection}/media/upload`] = {
      post: {
        summary: `Upload media for ${meta.label}`,
        tags: [tag],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  filename: { type: 'string' },
                  mimeType: { type: 'string' },
                  data: { type: 'string', description: 'Base64-encoded file bytes' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Stored media URL' } },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: options.title,
      version: apiVersion,
      description:
        'Loom JSON API. Cookie session + CSRF on mutations. Prefix and version are configured via LoomModuleOptions.api.',
    },
    paths,
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'loom_session' },
      },
    },
    security: [{ cookieAuth: [] }],
  };
}

function listParameters(): Array<Record<string, unknown>> {
  return [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'perPage', in: 'query', schema: { type: 'integer', default: 15 } },
    { name: 'search', in: 'query', schema: { type: 'string' } },
    { name: 'sort', in: 'query', schema: { type: 'string' } },
    { name: 'direction', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
    { name: 'trashed', in: 'query', schema: { type: 'string' } },
  ];
}

function resourceRecordSchema(meta: ResourceMeta): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of meta.fields) {
    if (field.hiddenOnForm || field.type === 'password') continue;
    properties[field.name] = fieldOpenApiType(field.type);
  }
  return { type: 'object', properties };
}

function fieldOpenApiType(type: string): Record<string, unknown> {
  switch (type) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
    case 'datetime':
      return { type: 'string', format: type === 'date' ? 'date' : 'date-time' };
    case 'file':
    case 'image':
      return { type: 'string', description: 'Public media URL' };
    default:
      return { type: 'string' };
  }
}
