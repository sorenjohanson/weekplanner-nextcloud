#!/usr/bin/env bash
#
# Round-trip + interop tests for tools/sign-app.php and
# tools/verify-app-signature.php.
#
# 1. Sign + verify a fixture with our PHP tools.
# 2. Tamper checks (modify / add files breaks verification).
# 3. Cert/key mismatch is rejected at signing time.
# 4. Interop gate: independently verify the signature with the openssl CLI
#    using the exact PSS parameters Nextcloud's Checker.php uses
#    (hash=sha1, mgf1=sha512, saltlen=0). This is the gate that would have
#    caught the PKCS#1-vs-PSS bug introduced in v1.8.3 — our PHP tools
#    could happily self-confirm a wrong scheme, but a totally separate
#    toolchain can't.
#
# Exits 0 on success, non-zero on the first failed assertion.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# 1. Build a tiny fixture app.
APP="$WORK/weekplanner"
mkdir -p "$APP/appinfo" "$APP/lib" "$APP/js" "$APP/css"
cat > "$APP/appinfo/info.xml" <<'EOF'
<?xml version="1.0"?>
<info><id>weekplanner</id><version>0.0.0</version></info>
EOF
echo '// fixture' > "$APP/lib/Bootstrap.php"
echo '/* fixture */' > "$APP/js/main.js"
echo '/* fixture */' > "$APP/css/main.css"

# 2. Generate a throwaway key + self-signed cert with CN=weekplanner.
openssl req -new -newkey rsa:2048 -nodes -x509 -days 1 \
	-subj "/CN=weekplanner" \
	-keyout "$WORK/app.key" -out "$WORK/app.crt" 2>/dev/null

# 3. Happy path: sign + verify with our tools.
php "$ROOT_DIR/tools/sign-app.php" "$APP" "$WORK/app.key" "$WORK/app.crt" >/dev/null
php "$ROOT_DIR/tools/verify-app-signature.php" "$APP" --cn=weekplanner >/dev/null
green "[ok] clean signature verifies (PHP tools)"

# 4. Interop: verify the same signature with the openssl CLI, using the exact
#    PSS parameters Nextcloud's Checker.php pins. If our PHP tools and openssl
#    disagree, one of them is wrong — and Nextcloud rejects whatever openssl
#    would also reject.
jq -r '.certificate' "$APP/appinfo/signature.json" > "$WORK/embedded.crt"
openssl x509 -in "$WORK/embedded.crt" -pubkey -noout > "$WORK/embedded.pub"

# Reproduce json_encode(ksort(hashes)) byte-for-byte. PHP's json_encode default
# escapes forward slashes as \/, which is what was signed.
php -r '
$d = json_decode(file_get_contents($argv[1]), true);
$h = $d["hashes"]; ksort($h);
echo json_encode($h);
' "$APP/appinfo/signature.json" > "$WORK/signed-bytes"

# Decode signature.json's signature field to raw binary.
jq -r '.signature' "$APP/appinfo/signature.json" | base64 -d > "$WORK/sig.bin"

# Verify with openssl. Different toolchain, same crypto contract.
if ! openssl dgst -sha1 \
	-verify "$WORK/embedded.pub" \
	-signature "$WORK/sig.bin" \
	-sigopt rsa_padding_mode:pss \
	-sigopt rsa_pss_saltlen:0 \
	-sigopt rsa_mgf1_md:sha512 \
	"$WORK/signed-bytes" >/dev/null; then
	red "[fail] openssl could not verify our signature with PSS/SHA1/MGF1-SHA512/saltlen=0"
	red "       Our PHP tools probably drifted from Nextcloud's Checker scheme."
	exit 1
fi
green "[ok] openssl verifies our signature with Nextcloud's PSS parameters"

# 5. Tamper: modify a file → verify must fail.
echo '// tampered' >> "$APP/js/main.js"
if php "$ROOT_DIR/tools/verify-app-signature.php" "$APP" >/dev/null 2>&1; then
	red "[fail] modified file did not break verification"
	exit 1
fi
green "[ok] modified file breaks verification"

# 6. Re-sign, then add an extra file → verify must fail.
php "$ROOT_DIR/tools/sign-app.php" "$APP" "$WORK/app.key" "$WORK/app.crt" >/dev/null
echo 'sneaky' > "$APP/lib/Sneaky.php"
if php "$ROOT_DIR/tools/verify-app-signature.php" "$APP" >/dev/null 2>&1; then
	red "[fail] extra file did not break verification"
	exit 1
fi
green "[ok] extra file breaks verification"

# 7. Cert/key mismatch must be rejected by sign-app (the cause of the v1.8.1
#    bug if APP_PRIVATE_KEY ever drifts from the published certificate).
openssl req -new -newkey rsa:2048 -nodes -x509 -days 1 \
	-subj "/CN=weekplanner" \
	-keyout "$WORK/other.key" -out "$WORK/other.crt" 2>/dev/null
rm -rf "$APP"
mkdir -p "$APP/appinfo"
echo '<?xml version="1.0"?><info><id>weekplanner</id></info>' > "$APP/appinfo/info.xml"
if php "$ROOT_DIR/tools/sign-app.php" "$APP" "$WORK/app.key" "$WORK/other.crt" >/dev/null 2>&1; then
	red "[fail] cert/key mismatch was not rejected"
	exit 1
fi
green "[ok] cert/key mismatch is rejected"

green "All signature round-trip + interop checks passed."
