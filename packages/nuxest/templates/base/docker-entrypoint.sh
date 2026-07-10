#!/bin/sh
set -e

# Dependency dirs are populated during image build as root, then persisted in
# named volumes. Reconcile ownership before dropping to the host user.
if [ -n "${APP_UID:-}" ] && [ -n "${APP_GID:-}" ]; then
  for dir in \
    /app/node_modules \
    /app/apps/api/node_modules \
    /app/apps/web/node_modules \
    /app/data
  do
    if [ -e "$dir" ]; then
      chown -R "${APP_UID}:${APP_GID}" "$dir"
    fi
  done

  exec su-exec "${APP_UID}:${APP_GID}" "$@"
fi

exec "$@"
