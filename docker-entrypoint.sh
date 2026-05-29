#!/bin/sh
set -e

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

# Re-apply trusted_domains on every start. The official nextcloud image only
# reads NEXTCLOUD_TRUSTED_DOMAINS during the very first install, so adding a
# Tailscale/LAN hostname later would silently not reach config.php.
php occ config:system:delete trusted_domains || true
i=0
for domain in ${NEXTCLOUD_TRUSTED_DOMAINS:-localhost}; do
  php occ config:system:set trusted_domains "$i" --value="$domain" || true
  i=$((i + 1))
done
# Keep the Docker-internal hostname trusted so notify_push can reach Nextcloud
# across the compose network.
php occ config:system:set trusted_domains "$i" --value='nextcloud' || true

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
# We deliberately do not set base_endpoint: the client overrides the WS URL
# to the page's own origin (via /push) so it works across any reachable
# hostname.
(
  echo "Waiting for notify_push daemon to become reachable…"
  until php -r "if(@fsockopen('notify_push',7867)){echo 'up';exit(0);}exit(1);" 2>/dev/null; do
    sleep 2
  done
  php occ notify_push:setup http://notify_push:7867 || true
  echo "notify_push setup complete"
) &

# Keep the container alive by waiting on Apache
wait
