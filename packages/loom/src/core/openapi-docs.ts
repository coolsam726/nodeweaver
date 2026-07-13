export type LoomOpenApiDocsUi = 'swagger' | 'redoc';

/**
 * Build interactive OpenAPI docs HTML (Swagger UI or Redoc).
 * Assets are same-origin under `{prefix}/docs/...` or `{prefix}/redoc/...` so default CSP applies.
 */
export function buildLoomOpenApiDocsHtml(options: {
  title: string;
  /** Absolute path to the OpenAPI JSON (e.g. `/api/loom/v1/openapi.json`) */
  specUrl: string;
  /** Absolute path prefix for this UI's static assets */
  docsBasePath: string;
  /** Which viewer to render (default: swagger) */
  ui?: LoomOpenApiDocsUi;
  /** CSRF cookie name for Swagger Try-it-out mutations (double-submit) */
  csrfCookieName?: string;
}): string {
  const ui = options.ui ?? 'swagger';
  if (ui === 'redoc') {
    return buildRedocHtml(options);
  }
  return buildSwaggerHtml(options);
}

function buildSwaggerHtml(options: {
  title: string;
  specUrl: string;
  docsBasePath: string;
  csrfCookieName?: string;
}): string {
  const title = escapeHtml(options.title);
  const docsBase = options.docsBasePath.replace(/\/$/, '');
  const cssHref = escapeHtml(`${docsBase}/swagger-ui.css`);
  const jsSrc = escapeHtml(`${docsBase}/swagger-ui-bundle.js`);
  const csrfCookie = options.csrfCookieName ?? 'loom_csrf';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — API docs</title>
  <link rel="stylesheet" href="${cssHref}" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${jsSrc}"></script>
  <script>
    function readCookie(name) {
      var match = document.cookie.match(
        new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\\[\\]\\\\/+^])/g, '\\\\$1') + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : '';
    }
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(options.specUrl)},
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
      requestInterceptor: function (req) {
        req.credentials = 'include';
        var method = (req.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          var token = readCookie(${JSON.stringify(csrfCookie)});
          if (token) {
            req.headers = req.headers || {};
            req.headers['X-CSRF-Token'] = token;
          }
        }
        return req;
      },
    });
  </script>
</body>
</html>
`;
}

function buildRedocHtml(options: {
  title: string;
  specUrl: string;
  docsBasePath: string;
}): string {
  const title = escapeHtml(options.title);
  const docsBase = options.docsBasePath.replace(/\/$/, '');
  const jsSrc = escapeHtml(`${docsBase}/redoc.standalone.js`);
  const specAttr = escapeHtml(options.specUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — API docs</title>
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <redoc spec-url="${specAttr}"></redoc>
  <script src="${jsSrc}"></script>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
