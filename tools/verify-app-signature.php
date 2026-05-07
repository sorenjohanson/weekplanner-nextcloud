<?php

/**
 * Locally verify a Nextcloud app's signature.json the same way the
 * server does on install / `occ integrity:check-app`.
 *
 * Mirrors lib/private/IntegrityCheck/Checker::verify() for an app path:
 *   1. Load signature.json, ksort hashes, decode signature.
 *   2. Verify the bundled certificate chains to the configured root CA
 *      (Nextcloud's resources/codesigning/root.crt — which actually contains
 *      the intermediate "Nextcloud Code Signing Intermediate Authority").
 *   3. Verify the RSA-PSS signature over json_encode(hashes) using
 *      hash=sha1, MGF1-hash=sha512, salt-length=0 — the exact scheme
 *      Nextcloud's Checker uses. PKCS#1 v1.5 signatures (e.g. anything
 *      produced by openssl_sign with OPENSSL_ALGO_SHA512) will be rejected
 *      here, the same way Nextcloud rejects them.
 *   4. Re-hash the app directory and report any missing / extra / changed
 *      files vs the stored hashes.
 *
 * Optional flags:
 *   --root-ca=<path>  Verify the bundled certificate against this CA cert
 *                     (Nextcloud's resources/codesigning/root.crt). Skipped
 *                     when not provided so contributors without the CA can
 *                     still validate hash + signature integrity locally.
 *   --cn=<appId>      Assert the certificate CN matches this app id.
 *
 * Usage:
 *   php tools/verify-app-signature.php <appPath> [--root-ca=<path>] [--cn=<appId>]
 *
 * Exit codes:
 *   0 — signature verified
 *   1 — verification failed (with a diagnostic on stderr)
 */

declare(strict_types=1);

require __DIR__ . '/../vendor-bin/signing/vendor/autoload.php';

use phpseclib3\Crypt\RSA;
use phpseclib3\File\X509;

if ($argc < 2) {
	fwrite(STDERR, "Usage: php verify-app-signature.php <appPath> [--root-ca=<path>] [--cn=<appId>]\n");
	exit(1);
}

$appPath = rtrim($argv[1], '/');
$rootCaPath = null;
$expectedCN = null;
for ($i = 2; $i < $argc; $i++) {
	if (str_starts_with($argv[$i], '--root-ca=')) {
		$rootCaPath = substr($argv[$i], strlen('--root-ca='));
	} elseif (str_starts_with($argv[$i], '--cn=')) {
		$expectedCN = substr($argv[$i], strlen('--cn='));
	} else {
		fwrite(STDERR, "::error::Unknown argument: {$argv[$i]}\n");
		exit(1);
	}
}

$signaturePath = "$appPath/appinfo/signature.json";
if (!file_exists($signaturePath)) {
	fwrite(STDERR, "::error::signature.json not found at $signaturePath\n");
	exit(1);
}

$signatureData = json_decode(file_get_contents($signaturePath), true);
if (!is_array($signatureData)
	|| !isset($signatureData['hashes'], $signatureData['signature'], $signatureData['certificate'])) {
	fwrite(STDERR, "::error::signature.json is malformed (missing hashes/signature/certificate)\n");
	exit(1);
}

// 1. Hashes & signature — sort like Nextcloud does before verifying.
$expectedHashes = $signatureData['hashes'];
ksort($expectedHashes);
$signature = base64_decode($signatureData['signature'], true);
if ($signature === false) {
	fwrite(STDERR, "::error::signature.json signature field is not valid base64\n");
	exit(1);
}
$certificatePem = $signatureData['certificate'];

$x509 = new X509();
if ($x509->loadX509($certificatePem) === false) {
	fwrite(STDERR, "::error::Failed to parse bundled certificate\n");
	exit(1);
}

// 2. Optional CA chain check — replicates Nextcloud's Checker::verify(), which
//    walks splitCerts(root.crt) and calls $x509->loadCA on each. The PEM file
//    in resources/codesigning/root.crt is actually a single intermediate
//    cert ("Nextcloud Code Signing Intermediate Authority"); we accept it as
//    a chain anchor here for parity.
if ($rootCaPath !== null) {
	$rootCaPem = @file_get_contents($rootCaPath);
	if ($rootCaPem === false) {
		fwrite(STDERR, "::error::Failed to read root CA: $rootCaPath\n");
		exit(1);
	}
	foreach (splitCerts($rootCaPem) as $rootCert) {
		$x509->loadCA($rootCert);
	}
	// Re-load the leaf so phpseclib re-evaluates issuer linkage with the CA(s) loaded.
	$x509->loadX509($certificatePem);
	if (!$x509->validateSignature()) {
		fwrite(STDERR, "::error::Certificate chain does not validate against $rootCaPath\n");
		exit(1);
	}
}

// 3. Optional CN check.
if ($expectedCN !== null) {
	$cn = $x509->getDN(X509::DN_OPENSSL)['CN'] ?? null;
	if ($cn !== $expectedCN) {
		fwrite(STDERR, sprintf(
			"::error::Certificate CN (%s) does not match expected app id (%s)\n",
			$cn ?? '?',
			$expectedCN,
		));
		exit(1);
	}
}

// 4. Verify the RSA-PSS signature. These parameters must match
//    lib/private/IntegrityCheck/Checker.php in Nextcloud server. Drifting
//    from this scheme is what caused the v1.8.3 integrity-check regression
//    (released as v1.8.3, v1.9.0 — see fix/signing).
$publicKey = $x509->getPublicKey();
if (!$publicKey instanceof RSA\PublicKey) {
	fwrite(STDERR, "::error::Bundled certificate's public key is not RSA\n");
	exit(1);
}
$verifier = $publicKey
	->withHash('sha1')
	->withMGFHash('sha512')
	->withSaltLength(0)
	->withPadding(RSA::SIGNATURE_PSS);

if (!$verifier->verify(json_encode($expectedHashes), $signature)) {
	fwrite(STDERR, "::error::Signature could not get verified.\n");
	fwrite(STDERR, "         (RSA-PSS / MGF1-SHA-512 / saltlen=0 over json_encode(ksort(hashes)).)\n");
	fwrite(STDERR, "         This is the same error Nextcloud's integrity check would raise.\n");
	exit(1);
}

// 5. Re-hash the disk and compare to stored hashes.
$currentHashes = computeHashes($appPath);
ksort($currentHashes);

$missing = array_diff_key($expectedHashes, $currentHashes);
$extra = array_diff_key($currentHashes, $expectedHashes);
$changed = [];
foreach ($expectedHashes as $path => $hash) {
	if (isset($currentHashes[$path]) && $currentHashes[$path] !== $hash) {
		$changed[] = $path;
	}
}

if ($missing || $extra || $changed) {
	fwrite(STDERR, "::error::Hash mismatch — Nextcloud's integrity check would fail.\n");
	if ($missing) {
		fwrite(STDERR, 'Missing on disk (' . count($missing) . "):\n");
		foreach (array_keys($missing) as $f) {
			fwrite(STDERR, "  - $f\n");
		}
	}
	if ($extra) {
		fwrite(STDERR, 'Unsigned files on disk (' . count($extra) . "):\n");
		foreach (array_keys($extra) as $f) {
			fwrite(STDERR, "  - $f\n");
		}
	}
	if ($changed) {
		fwrite(STDERR, 'Modified after signing (' . count($changed) . "):\n");
		foreach ($changed as $f) {
			fwrite(STDERR, "  - $f\n");
		}
	}
	exit(1);
}

echo 'Signature verified for ' . count($expectedHashes) . " files in $appPath\n";

function computeHashes(string $appPath): array {
	$dir = new RecursiveDirectoryIterator($appPath, RecursiveDirectoryIterator::SKIP_DOTS);
	$iterator = new RecursiveIteratorIterator($dir);

	$hashes = [];
	foreach ($iterator as $file) {
		if (!$file->isFile()) {
			continue;
		}
		$relativePath = ltrim(substr($file->getPathname(), strlen($appPath)), '/');
		if ($relativePath === 'appinfo/signature.json') {
			continue;
		}
		$hashes[$relativePath] = hash_file('sha512', $file->getPathname());
	}
	return $hashes;
}

/**
 * Mirrors Nextcloud's Checker::splitCerts — accepts a PEM bundle and returns
 * each individual certificate as its own PEM string.
 */
function splitCerts(string $bundle): array {
	$out = [];
	if (preg_match_all('/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/', $bundle, $m)) {
		$out = $m[0];
	}
	return $out;
}
