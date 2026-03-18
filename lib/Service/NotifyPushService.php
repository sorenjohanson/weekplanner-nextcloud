<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Service;

use OCP\App\IAppManager;
use OCP\Server;
use Psr\Log\LoggerInterface;

class NotifyPushService {
	/** @var object|null */
	private $queue = null;
	private bool $resolved = false;

	/** @psalm-suppress PossiblyUnusedMethod */
	public function __construct(
		private IAppManager $appManager,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * @psalm-suppress MixedAssignment
	 * @psalm-suppress MixedReturnStatement
	 * @psalm-suppress MixedInferredReturnType
	 */
	private function getQueue(): ?object {
		if ($this->resolved) {
			return $this->queue;
		}

		$this->resolved = true;

		if (!$this->appManager->isEnabledForUser('notify_push')) {
			return null;
		}

		try {
			$this->queue = Server::get('OCA\NotifyPush\Queue\IQueue');
		} catch (\Throwable $e) {
			$this->logger->debug('notify_push IQueue not available: ' . $e->getMessage());
		}

		return $this->queue;
	}

	/**
	 * @psalm-suppress PossiblyUnusedMethod, MixedMethodCall
	 */
	public function isAvailable(): bool {
		return $this->getQueue() !== null;
	}

	/**
	 * @psalm-suppress MixedMethodCall
	 */
	public function notifyWeekUpdate(string $userId, int $year, int $week): void {
		$queue = $this->getQueue();
		if ($queue === null) {
			return;
		}

		try {
			$queue->push('notify_custom', [
				'user' => $userId,
				'message' => 'weekplanner_week_update',
				'body' => ['year' => $year, 'week' => $week],
			]);
		} catch (\Throwable $e) {
			$this->logger->debug('Failed to push week update notification: ' . $e->getMessage());
		}
	}

	/**
	 * @psalm-suppress MixedMethodCall
	 */
	public function notifyCustomColumnsUpdate(string $userId): void {
		$queue = $this->getQueue();
		if ($queue === null) {
			return;
		}

		try {
			$queue->push('notify_custom', [
				'user' => $userId,
				'message' => 'weekplanner_customcolumns_update',
			]);
		} catch (\Throwable $e) {
			$this->logger->debug('Failed to push custom columns update notification: ' . $e->getMessage());
		}
	}
}
