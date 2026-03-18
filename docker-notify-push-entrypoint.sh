#!/bin/sh
set -e

case "$(uname -m)" in
  x86_64)         ARCH=x86_64 ;;
  aarch64|arm64)  ARCH=aarch64 ;;
  armv7*)         ARCH=armv7 ;;
  *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac
BINARY=/var/www/html/custom_apps/notify_push/bin/${ARCH}/notify_push

echo "Waiting for notify_push binary at ${BINARY}…"
while [ ! -f "${BINARY}" ]; do
  sleep 2
done

chmod +x "${BINARY}"
echo "Starting notify_push daemon…"
exec "${BINARY}" /var/www/html/config/config.php
