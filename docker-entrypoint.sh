#!/bin/sh
set -e

# The migration-target instance in docker-compose runs the same entrypoint but
# doesn't have a notify_push sidecar, so it opts out via this env var.
ENABLE_NOTIFY_PUSH=${WEEKPLANNER_ENABLE_NOTIFY_PUSH:-true}

# Run occ as www-data, matching the official entrypoint. Running it as root
# before the image finishes installing creates root-owned files (notably an
# empty config/config.php), which then blocks the installer with "Can't write
# into config directory".
occ() {
  runuser -u www-data -- php /var/www/html/occ "$@"
}

if [ "$ENABLE_NOTIFY_PUSH" = "true" ]; then
  # Reverse-proxy notify_push at /push so the WebSocket inherits whatever origin
  # the page was loaded from. Without this, the browser would have to connect
  # directly to a fixed notify_push host:port baked into base_endpoint, which
  # breaks the moment the app is reached over a different name (LAN IP,
  # Tailscale, mDNS) or from a different network.
  a2enmod proxy proxy_http proxy_wstunnel >/dev/null
  cat > /etc/apache2/conf-enabled/notify_push.conf <<'EOF'
ProxyPass /push/ws ws://notify_push:7867/ws
ProxyPassReverse /push/ws ws://notify_push:7867/ws
ProxyPass /push http://notify_push:7867
ProxyPassReverse /push http://notify_push:7867
EOF
fi

CONFIG_FILE=/var/www/html/config/config.php

# Recover an instance left broken by an older entrypoint that ran occ as root
# before installation finished. An empty config.php means there is no valid
# install to preserve, so drop it and version.php to let the official
# entrypoint run a fresh installation.
if [ -f "$CONFIG_FILE" ] && [ ! -s "$CONFIG_FILE" ]; then
  rm -f "$CONFIG_FILE" /var/www/html/version.php
fi
# The same broken runs could leave a root-owned log file behind.
if [ -f /var/www/html/data/nextcloud.log ]; then
  chown www-data:www-data /var/www/html/data/nextcloud.log || true
fi

# Run the default Nextcloud entrypoint (installs/upgrades Nextcloud)
/entrypoint.sh apache2-foreground &

# The official entrypoint only execs Apache after installation or upgrade is
# complete, so port 80 is a reliable readiness signal. Wait for it before
# running occ; otherwise occ can race the installer and create root-owned files.
until php -r '$s = @fsockopen("127.0.0.1", 80); if ($s) { fclose($s); exit(0); } exit(1);' 2>/dev/null; do
  echo "Waiting for Nextcloud to finish installing…"
  sleep 2
done

until occ status --output=json 2>/dev/null | grep -q '"installed":true'; do
  echo "Waiting for Nextcloud to finish installing…"
  sleep 2
done

# Configure Redis for file locking
occ config:system:set memcache.locking --value '\OC\Memcache\Redis' || true
# Route background jobs through the external cron sidecar. Ajax cron only
# fires on browser page loads, which is fine for interactive testing but
# means queued jobs (like user_migration export/import) never run when the
# UI is idle. See the nextcloud_cron / nextcloud_import_cron services.
occ background:cron || true
# Allow the notify_push container (and Docker network) to reach Nextcloud
occ config:system:set trusted_proxies 0 --value='10.0.0.0/8' || true
occ config:system:set trusted_proxies 1 --value='172.16.0.0/12' || true
occ config:system:set trusted_proxies 2 --value='192.168.0.0/16' || true

# Re-apply trusted_domains on every start. The official nextcloud image only
# reads NEXTCLOUD_TRUSTED_DOMAINS during the very first install, so adding a
# Tailscale/LAN hostname later would silently not reach config.php.
occ config:system:delete trusted_domains || true
i=0
for domain in ${NEXTCLOUD_TRUSTED_DOMAINS:-localhost}; do
  occ config:system:set trusted_domains "$i" --value="$domain" || true
  i=$((i + 1))
done
# Keep the Docker-internal hostname trusted so notify_push can reach Nextcloud
# across the compose network.
occ config:system:set trusted_domains "$i" --value='nextcloud' || true

chown www-data:www-data /var/www/html/custom_apps

# user_migration ships with Nextcloud but isn't always enabled by default in
# the docker image. Enable it so users can export/import via Personal
# settings → Data migration and via `occ user:export` / `occ user:import`.
occ app:enable user_migration || true

if [ "$ENABLE_NOTIFY_PUSH" = "true" ]; then
  occ app:install notify_push || true
  occ app:enable notify_push || true

  case "$(uname -m)" in
    x86_64)         NP_ARCH=x86_64 ;;
    aarch64|arm64)  NP_ARCH=aarch64 ;;
    armv7*)         NP_ARCH=armv7 ;;
    *)              NP_ARCH=$(uname -m) ;;
  esac
  chmod +x /var/www/html/custom_apps/notify_push/bin/${NP_ARCH}/notify_push || true
fi

occ app:enable weekplanner || true
echo "weekplanner app enabled"

if [ "$ENABLE_NOTIFY_PUSH" = "true" ]; then
  # Wait for the notify_push sidecar to start listening, then register it.
  # We deliberately do not set base_endpoint: the client overrides the WS URL
  # to the page's own origin (via /push) so it works across any reachable
  # hostname.
  (
    echo "Waiting for notify_push daemon to become reachable…"
    until php -r "if(@fsockopen('notify_push',7867)){echo 'up';exit(0);}exit(1);" 2>/dev/null; do
      sleep 2
    done
    occ notify_push:setup http://notify_push:7867 || true
    echo "notify_push setup complete"
  ) &
fi

# Keep the container alive by waiting on Apache
wait
