#!/bin/sh
set -e

# Run the default Nextcloud entrypoint (installs/upgrades Nextcloud)
/entrypoint.sh apache2-foreground &

# Wait until Nextcloud is fully installed before enabling the app
until php occ status --output=json 2>/dev/null | grep -q '"installed":true'; do
  echo "Waiting for Nextcloud to finish installing…"
  sleep 2
done

# Configure Redis for file locking
php occ config:system:set memcache.locking --value '\OC\Memcache\Redis' || true

# Allow the notify_push container (and Docker network) to reach Nextcloud
php occ config:system:set trusted_proxies 0 --value='172.16.0.0/12' || true

# Ensure www-data owns the custom_apps directory so the App Store can
# install / update apps alongside the bind-mounted weekplanner app.
chown www-data:www-data /var/www/html/custom_apps

# Install and enable notify_push from the App Store
php occ app:install notify_push || true
php occ app:enable notify_push || true

# The App Store download does not preserve the execute bit
case "$(uname -m)" in
  x86_64)         NP_ARCH=x86_64 ;;
  aarch64|arm64)  NP_ARCH=aarch64 ;;
  armv7*)         NP_ARCH=armv7 ;;
  *) NP_ARCH=$(uname -m) ;;
esac
chmod +x /var/www/html/custom_apps/notify_push/bin/${NP_ARCH}/notify_push || true

php occ app:enable weekplanner || true
echo "weekplanner app enabled"

# Wait for the notify_push sidecar to start listening, then register it.
(
  echo "Waiting for notify_push daemon to become reachable…"
  until nc -z notify_push 7867 2>/dev/null; do
    sleep 2
  done
  # Verify the daemon and register it using the internal Docker hostname.
  php occ notify_push:setup http://notify_push:7867 || true
  # Override the stored endpoint with the external URL so browsers can connect.
  php occ config:app:set notify_push base_endpoint --value http://localhost:7867 || true
  echo "notify_push setup complete"
) &

# Keep the container alive by waiting on Apache
wait
