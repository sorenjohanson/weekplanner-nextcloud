#!/bin/sh
set -e

# Run the default Nextcloud entrypoint (installs/upgrades Nextcloud)
/entrypoint.sh apache2-foreground &

# Wait until Nextcloud is fully installed before enabling the app
until php occ status --output=json 2>/dev/null | grep -q '"installed":true'; do
  echo "Waiting for Nextcloud to finish installing…"
  sleep 2
done

php occ app:enable weekplanner || true
echo "weekplanner app enabled"

# Keep the container alive by waiting on Apache
wait
