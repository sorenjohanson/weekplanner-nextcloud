<?php

/**
 * Sign a Nextcloud app directory.
 *
 * Produces <appPath>/appinfo/signature.json containing:
 *   - hashes: { relativePath: sha512 } for every file except signature.json
 *             (sorted alphabetically, mirroring Nextcloud's Checker)
 *   - signature: base64 of an RSA-PSS signature over json_encode(hashes),
 *                using SHA-1 for the message digest, MGF1-SHA-512 for the
 *                mask, and salt length 0 — these are the exact parameters
 *                Nextcloud's lib/private/IntegrityCheck/Checker.php uses
 *                when verifying. Any other padding scheme (notably PKCS#1
 *                v1.5) produces a signature that openssl_verify will accept
 *                in isolation but Nextcloud's integrity check rejects with
 *                "Signature could not get verified.".
 *   - certificate: the PEM cert for the app
 *
 * Usage:
 *   php tools/sign-app.php <appPath> <privateKeyPath> <certificatePath>
 */

declare(strict_types=1);

require __DIR__ . '/../vendor-bin/signing/vendor/autoload.php';

use phpseclib3\Crypt\RSA;
use phpseclib3\File\X509;

if ($argc !== 4) {
	fwrite(STDERR, "Usage: php sign-app.php <appPath> <privateKeyPath> <certificatePath>\n");
	exit(1);
}

[$_, $appPath, $privateKeyPath, $certificatePath] = $argv;
$appPath = rtrim($appPath, '/');

if (!is_dir($appPath)) {
	fwrite(STDERR, "::error::App path not found: $appPath\n");
	exit(1);
}

$privateKeyPem = @file_get_contents($privateKeyPath);
if ($privateKeyPem === false) {
	fwrite(STDERR, "::error::Failed to read private key: $privateKeyPath\n");
	exit(1);
}

try {
	$privateKey = RSA::loadPrivateKey($privateKeyPem);
} catch (\Throwable $e) {
	fwrite(STDERR, '::error::Failed to load private key: ' . $e->getMessage() . "\n");
	exit(1);
}
if (!$privateKey instanceof RSA\PrivateKey) {
	fwrite(STDERR, "::error::Private key did not parse as an RSA key.\n");
	exit(1);
}

$certificate = @file_get_contents($certificatePath);
if ($certificate === false || trim($certificate) === '') {
	fwrite(STDERR, "::error::Failed to read certificate: $certificatePath\n");
	exit(1);
}

// Sanity: cert public key must match the signing private key, otherwise
// Nextcloud's integrity check will fail with "Signature could not get
// verified." (see v1.8.1 cert/key drift bug).
$x509 = new X509();
if ($x509->loadX509($certificate) === false) {
	fwrite(STDERR, "::error::Failed to parse certificate.\n");
	exit(1);
}
$certPublicKey = $x509->getPublicKey();
if ($certPublicKey === false) {
	fwrite(STDERR, "::error::Failed to extract public key from certificate.\n");
	exit(1);
}
$privPublicKeyPem = (string)$privateKey->getPublicKey();
$certPublicKeyPem = (string)$certPublicKey;
if ($privPublicKeyPem !== $certPublicKeyPem) {
	fwrite(STDERR, "::error::Certificate public key does not match the signing private key.\n");
	fwrite(STDERR, "          Signatures produced now will fail Nextcloud integrity verification.\n");
	exit(1);
}

$hashes = computeHashes($appPath);
ksort($hashes);

// Match Nextcloud's Checker::verify() exactly:
//   $rsa->setSignatureMode(RSA::SIGNATURE_PSS);
//   $rsa->setMGFHash('sha512');
//   $rsa->setSaltLength(0);
// (phpseclib v1's default message-digest hash is SHA-1, and Checker never
// calls setHash(), so we keep SHA-1 here too.)
$signer = $privateKey
	->withHash('sha1')
	->withMGFHash('sha512')
	->withSaltLength(0)
	->withPadding(RSA::SIGNATURE_PSS);

try {
	$signature = $signer->sign(json_encode($hashes));
} catch (\Throwable $e) {
	fwrite(STDERR, '::error::Signing failed: ' . $e->getMessage() . "\n");
	exit(1);
}

$result = [
	'hashes' => $hashes,
	'signature' => base64_encode($signature),
	'certificate' => $certificate,
];

$out = "$appPath/appinfo/signature.json";
if (file_put_contents($out, json_encode($result, JSON_PRETTY_PRINT)) === false) {
	fwrite(STDERR, "::error::Failed to write $out\n");
	exit(1);
}

echo 'Signed ' . count($hashes) . " files into $out\n";

/**
 * Iterate the app directory and return [relativePath => sha512].
 *
 * Mirrors Nextcloud's Checker::generateHashes for app paths:
 * skips only appinfo/signature.json (.htaccess and .user.ini exclusions
 * apply to the server root, not to apps).
 */
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
