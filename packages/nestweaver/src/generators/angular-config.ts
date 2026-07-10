import type { ScaffoldOptions } from '../types.js';
import { NEST_DEFAULT_PORT, WEB_DEV_DEFAULT_PORT } from '../constants.js';
import { isSsrFrontend } from '../frontend.js';

function formatAllowedHosts(): string {
  const hosts = [
    'localhost',
    '127.0.0.1',
    `localhost:${WEB_DEV_DEFAULT_PORT}`,
    `127.0.0.1:${WEB_DEV_DEFAULT_PORT}`,
    `localhost:${NEST_DEFAULT_PORT}`,
    `127.0.0.1:${NEST_DEFAULT_PORT}`,
  ];

  return hosts.map((host) => `                "${host}"`).join(',\n');
}

export function generateAngularJson(options: ScaffoldOptions): string {
  const ssr = isSsrFrontend(options);
  const allowedHosts = formatAllowedHosts();
  const ssrBuildFields = ssr
    ? `,
            "server": "src/main.server.ts",
            "outputMode": "server",
            "ssr": {
              "entry": "src/server.ts"
            },
            "security": {
              "allowedHosts": [
${allowedHosts}
              ]
            }`
    : '';

  return `{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "cli": {
    "packageManager": "pnpm"
  },
  "newProjectRoot": "projects",
  "projects": {
    "web": {
      "projectType": "application",
      "schematics": {},
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": [
              "zone.js"
            ],
            "tsConfig": "tsconfig.app.json",
            "assets": [
              {
                "glob": "**/*",
                "input": "public"
              }
            ],
            "styles": [
              "src/styles.css"
            ],
            "scripts": []${ssrBuildFields}
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kB",
                  "maximumError": "1MB"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "4kB",
                  "maximumError": "8kB"
                }
              ],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "options": {
            "allowedHosts": [
${allowedHosts}
            ]
          },
          "configurations": {
            "production": {
              "buildTarget": "web:build:production"
            },
            "development": {
              "buildTarget": "web:build:development"
            }
          },
          "defaultConfiguration": "development"
        },
        "extract-i18n": {
          "builder": "@angular-devkit/build-angular:extract-i18n"
        }
      }
    }
  }
}
`;
}

export function generateAngularProxyConf(): string {
  return `const nestOrigin = (
  process.env.API_BASE_SERVER ?? 'http://127.0.0.1:${NEST_DEFAULT_PORT}'
).replace(/\\/api\\/?$/, '');

module.exports = {
  '/api': {
    target: nestOrigin,
    secure: false,
    changeOrigin: true,
  },
};
`;
}
