<?php

declare(strict_types=1);

/**
 * Minimal Symfony Console stubs used only for tests.
 * The real classes are provided at runtime by Nextcloud's server dependencies.
 *
 * @psalm-suppress InvalidClassConstantType
 */

namespace Symfony\Component\Console\Output;

if (!interface_exists(OutputInterface::class, false)) {
	interface OutputInterface {
		public const VERBOSITY_QUIET = 16;
		public const VERBOSITY_NORMAL = 32;
		public const VERBOSITY_VERBOSE = 64;
		public const VERBOSITY_VERY_VERBOSE = 128;
		public const VERBOSITY_DEBUG = 256;
		public const OUTPUT_NORMAL = 1;
		public const OUTPUT_RAW = 2;
		public const OUTPUT_PLAIN = 4;

		public function write(string|iterable $messages, bool $newline = false, int $options = 0): void;
		public function writeln(string|iterable $messages, int $options = 0): void;
		public function setVerbosity(int $level): void;
		public function getVerbosity(): int;
		public function isQuiet(): bool;
		public function isVerbose(): bool;
		public function isVeryVerbose(): bool;
		public function isDebug(): bool;
		public function setDecorated(bool $decorated): void;
		public function isDecorated(): bool;
	}
}

if (!class_exists(NullOutput::class, false)) {
	class NullOutput implements OutputInterface {
		public function write(string|iterable $messages, bool $newline = false, int $options = 0): void {
		}
		public function writeln(string|iterable $messages, int $options = 0): void {
		}
		public function setVerbosity(int $level): void {
		}
		public function getVerbosity(): int {
			return self::VERBOSITY_QUIET;
		}
		public function isQuiet(): bool {
			return true;
		}
		public function isVerbose(): bool {
			return false;
		}
		public function isVeryVerbose(): bool {
			return false;
		}
		public function isDebug(): bool {
			return false;
		}
		public function setDecorated(bool $decorated): void {
		}
		public function isDecorated(): bool {
			return false;
		}
	}
}
