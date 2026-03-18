<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

// Register OCP stubs from nextcloud/ocp dev dependency
spl_autoload_register(static function (string $class): void {
	$prefix = 'OCP\\';
	if (!str_starts_with($class, $prefix)) {
		return;
	}

	$file = __DIR__ . '/../vendor/nextcloud/ocp/' . str_replace('\\', '/', $class) . '.php';
	if (file_exists($file)) {
		require_once $file;
	}
});
