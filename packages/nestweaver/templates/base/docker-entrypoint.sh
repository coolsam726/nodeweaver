#!/bin/sh
set -e

# Named volumes can outlive image rebuilds and leave pnpm's symlink tree incomplete
# (e.g. browserslist -> node-releases). Reconcile on every container start.
pnpm install --frozen-lockfile

# postinstall (nuxt prepare) writes to bind-mounted apps/* as root — fix ownership
# so the dev process can update .nuxt and other generated files.
if [ -n "${APP_UID:-}" ] && [ -n "${APP_GID:-}" ]; then
  for dir in \
    /app/node_modules \
    /app/apps \
    /app/packages \
    /app/data
  do
    if [ -e "$dir" ]; then
      chown -R "${APP_UID}:${APP_GID}" "$dir"
    fi
  done

  exec su-exec "${APP_UID}:${APP_GID}" "$@"
fi

exec "$@"
