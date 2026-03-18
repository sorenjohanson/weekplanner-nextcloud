<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Tests\Controller;

use OCA\WeekPlanner\Controller\WeekController;
use OCA\WeekPlanner\Db\Week;
use OCA\WeekPlanner\Db\WeekMapper;
use OCA\WeekPlanner\Service\NotifyPushService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * @psalm-suppress PropertyNotSetInConstructor
 */
class WeekControllerTest extends TestCase {
	private WeekMapper&MockObject $weekMapper;
	private IUserSession&MockObject $userSession;
	private NotifyPushService&MockObject $notifyPush;
	private WeekController $controller;

	protected function setUp(): void {
		$request = $this->createMock(IRequest::class);
		$this->weekMapper = $this->createMock(WeekMapper::class);
		$this->userSession = $this->createMock(IUserSession::class);
		$this->notifyPush = $this->createMock(NotifyPushService::class);

		$this->controller = new WeekController(
			$request,
			$this->weekMapper,
			$this->userSession,
			$this->notifyPush,
		);
	}

	private function mockUser(string $uid = 'testuser'): void {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn($uid);
		$this->userSession->method('getUser')->willReturn($user);
	}

	private function emptyWeek(): array {
		return [
			'days' => [
				'monday' => [],
				'tuesday' => [],
				'wednesday' => [],
				'thursday' => [],
				'friday' => [],
				'saturday' => [],
				'sunday' => [],
			],
		];
	}

	// --- get() tests ---

	public function testGetReturnsUnauthorizedWhenNotLoggedIn(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->get(2026, 12);

		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
		self::assertSame(['error' => 'Not logged in'], $response->getData());
	}

	public function testGetReturnsEmptyWeekWhenNoDataExists(): void {
		$this->mockUser();
		$this->weekMapper->method('findByUserAndWeek')->willReturn(null);

		$response = $this->controller->get(2026, 12);

		$expected = array_merge($this->emptyWeek(), ['updatedAt' => 0]);
		self::assertSame(Http::STATUS_OK, $response->getStatus());
		self::assertSame($expected, $response->getData());
	}

	public function testGetReturnsStoredData(): void {
		$this->mockUser();

		$entity = new Week();
		$entity->setData(json_encode(['days' => ['monday' => [['text' => 'Task 1']]]]));
		$entity->setUpdatedAt(1000);

		$this->weekMapper->method('findByUserAndWeek')
			->with('testuser', 2026, 12)
			->willReturn($entity);

		$response = $this->controller->get(2026, 12);

		self::assertSame(Http::STATUS_OK, $response->getStatus());
		/** @var array $data */
		$data = $response->getData();
		self::assertSame(1000, $data['updatedAt']);
		self::assertSame([['text' => 'Task 1']], $data['days']['monday']);
	}

	public function testGetReturnsEmptyWeekWhenDataIsInvalidJson(): void {
		$this->mockUser();

		$entity = new Week();
		$entity->setData('not-json');
		$entity->setUpdatedAt(1000);

		$this->weekMapper->method('findByUserAndWeek')->willReturn($entity);

		$response = $this->controller->get(2026, 12);

		$expected = array_merge($this->emptyWeek(), ['updatedAt' => 0]);
		self::assertSame($expected, $response->getData());
	}

	// --- put() tests ---

	public function testPutReturnsUnauthorizedWhenNotLoggedIn(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->put(2026, 12, []);

		self::assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
	}

	public function testPutCreatesNewEntityWhenNoneExists(): void {
		$this->mockUser();
		$this->weekMapper->method('findByUserAndWeek')->willReturn(null);

		$this->weekMapper->expects(self::once())
			->method('insert')
			->willReturnCallback(function (Week $entity): Week {
				self::assertSame('testuser', $entity->getUserId());
				self::assertSame(2026, $entity->getYear());
				self::assertSame(12, $entity->getWeek());
				return $entity;
			});
		$this->weekMapper->expects(self::never())->method('update');
		$this->notifyPush->expects(self::once())
			->method('notifyWeekUpdate')
			->with('testuser', 2026, 12);

		$response = $this->controller->put(2026, 12, ['monday' => [['text' => 'Do stuff']]]);

		/** @var array $data */
		$data = $response->getData();
		self::assertSame('ok', $data['status']);
		self::assertIsInt($data['updatedAt']);
	}

	public function testPutUpdatesExistingEntity(): void {
		$this->mockUser();

		$existing = new Week();
		$existing->setUserId('testuser');
		$existing->setYear(2026);
		$existing->setWeek(12);
		$existing->setData('{}');
		$existing->setUpdatedAt(500);

		$this->weekMapper->method('findByUserAndWeek')->willReturn($existing);

		$this->weekMapper->expects(self::once())
			->method('update')
			->willReturnCallback(function (Week $entity) use ($existing): Week {
				self::assertSame($existing, $entity);
				self::assertGreaterThan(500, $entity->getUpdatedAt());
				return $entity;
			});
		$this->weekMapper->expects(self::never())->method('insert');

		$response = $this->controller->put(2026, 12, ['monday' => []]);

		/** @var array $data */
		$data = $response->getData();
		self::assertSame('ok', $data['status']);
	}

	// --- poll() tests ---

	public function testPollReturnsUnauthorizedWhenNotLoggedIn(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->poll(2026, 12, 0);

		self::assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
	}

	public function testPollReturnsChangedDataImmediatelyWhenUpdated(): void {
		$this->mockUser();

		$weekData = ['days' => ['monday' => [['text' => 'New task']]]];
		$entity = new Week();
		$entity->setData(json_encode($weekData));
		$entity->setUpdatedAt(200);

		$this->weekMapper->method('getUpdatedAt')
			->with('testuser', 2026, 12)
			->willReturn(200);

		$this->weekMapper->method('findByUserAndWeek')
			->with('testuser', 2026, 12)
			->willReturn($entity);

		$response = $this->controller->poll(2026, 12, 100);

		/** @var array $data */
		$data = $response->getData();
		self::assertTrue($data['changed']);
		self::assertSame(200, $data['updatedAt']);
		self::assertSame($weekData, $data['data']);
	}

	public function testPollReturnsEmptyWeekWhenEntityIsNull(): void {
		$this->mockUser();

		$this->weekMapper->method('getUpdatedAt')->willReturn(200);
		$this->weekMapper->method('findByUserAndWeek')->willReturn(null);

		$response = $this->controller->poll(2026, 12, 100);

		/** @var array $data */
		$data = $response->getData();
		self::assertTrue($data['changed']);
		self::assertSame($this->emptyWeek(), $data['data']);
	}
}
