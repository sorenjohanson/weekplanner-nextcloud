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
php occ config:system:set trusted_proxies 0 --value='10.0.0.0/8' || true
php occ config:system:set trusted_proxies 1 --value='172.16.0.0/12' || true
php occ config:system:set trusted_proxies 2 --value='192.168.0.0/16' || true
php occ config:system:set trusted_domains 1 --value='nextcloud' || true

chown www-data:www-data /var/www/html/custom_apps

php occ app:install notify_push || true
php occ app:enable notify_push || true

case "$(uname -m)" in
  x86_64)         NP_ARCH=x86_64 ;;
  aarch64|arm64)  NP_ARCH=aarch64 ;;
  armv7*)         NP_ARCH=armv7 ;;
  *)              NP_ARCH=$(uname -m) ;;
esac
chmod +x /var/www/html/custom_apps/notify_push/bin/${NP_ARCH}/notify_push || true

php occ app:enable weekplanner || true
echo "weekplanner app enabled"

# Wait for the notify_push sidecar to start listening, then register it.
(
  echo "Waiting for notify_push daemon to become reachable…"
  until php -r "if(@fsockopen('notify_push',7867)){echo 'up';exit(0);}exit(1);" 2>/dev/null; do
    sleep 2
  done
  php occ notify_push:setup http://notify_push:7867 || true
  php occ config:app:set notify_push base_endpoint --value "${NOTIFY_PUSH_BASE_URL}" || true
  echo "notify_push setup complete"
) &

# Keep the container alive by waiting on Apache
wait