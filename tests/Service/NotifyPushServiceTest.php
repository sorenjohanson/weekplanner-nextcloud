<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Tests\Service;

use OCA\WeekPlanner\Service\NotifyPushService;
use OCP\App\IAppManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @psalm-suppress PropertyNotSetInConstructor
 */
class NotifyPushServiceTest extends TestCase {
	private IAppManager&MockObject $appManager;
	private LoggerInterface&MockObject $logger;

	protected function setUp(): void {
		$this->appManager = $this->createMock(IAppManager::class);
		$this->logger = $this->createMock(LoggerInterface::class);
	}

	private function createService(): NotifyPushService {
		return new NotifyPushService($this->appManager, $this->logger);
	}

	public function testIsAvailableReturnsFalseWhenNotifyPushDisabled(): void {
		$this->appManager->method('isEnabledForUser')
			->with('notify_push')
			->willReturn(false);

		$service = $this->createService();

		self::assertFalse($service->isAvailable());
	}

	public function testNotifyWeekUpdateDoesNothingWhenNotAvailable(): void {
		$this->appManager->method('isEnabledForUser')->willReturn(false);

		$service = $this->createService();
		$service->notifyWeekUpdate('user1', 2026, 12);

		// No exception means the method handled the unavailability gracefully
		self::assertFalse($service->isAvailable());
	}

	public function testNotifyCustomColumnsUpdateDoesNothingWhenNotAvailable(): void {
		$this->appManager->method('isEnabledForUser')->willReturn(false);

		$service = $this->createService();
		$service->notifyCustomColumnsUpdate('user1');

		self::assertFalse($service->isAvailable());
	}

	public function testIsAvailableReturnsFalseWhenQueueResolutionFails(): void {
		$this->appManager->method('isEnabledForUser')->willReturn(true);

		$this->logger->expects(self::once())
			->method('debug')
			->with(self::stringContains('notify_push IQueue not available'));

		$service = $this->createService();

		// Server::get will throw because we're not in a real Nextcloud environment
		self::assertFalse($service->isAvailable());
	}

	public function testQueueResolutionIsCached(): void {
		$this->appManager->expects(self::once())
			->method('isEnabledForUser')
			->with('notify_push')
			->willReturn(false);

		$service = $this->createService();

		// Call twice - isEnabledForUser should only be called once due to caching
		$service->isAvailable();
		$service->isAvailable();
	}
}
