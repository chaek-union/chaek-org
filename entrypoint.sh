#!/bin/sh
mkdir -p /app/data/book-translations
chown -R node:node /app/data
exec gosu node "$@"
