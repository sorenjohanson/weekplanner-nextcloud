<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Tests\Controller;

use OCA\WeekPlanner\Controller\CustomColumnsController;
use OCA\WeekPlanner\Db\CustomColumns;
use OCA\WeekPlanner\Db\CustomColumnsMapper;
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
class CustomColumnsControllerTest extends TestCase {
	private CustomColumnsMapper&MockObject $mapper;
	private IUserSession&MockObject $userSession;
	private NotifyPushService&MockObject $notifyPush;
	private CustomColumnsController $controller;

	protected function setUp(): void {
		$request = $this->createMock(IRequest::class);
		$this->mapper = $this->createMock(CustomColumnsMapper::class);
		$this->userSession = $this->createMock(IUserSession::class);
		$this->notifyPush = $this->createMock(NotifyPushService::class);

		$this->controller = new CustomColumnsController(
			$request,
			$this->mapper,
			$this->userSession,
			$this->notifyPush,
		);
	}

	private function mockUser(string $uid = 'testuser'): void {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn($uid);
		$this->userSession->method('getUser')->willReturn($user);
	}

	private function emptyCustomColumns(): array {
		return [
			'columns' => [
				['id' => 'custom_1', 'title' => 'Someday', 'tasks' => []],
				['id' => 'custom_2', 'title' => '', 'tasks' => []],
				['id' => 'custom_3', 'title' => '', 'tasks' => []],
			],
		];
	}

	// --- get() tests ---

	public function testGetReturnsUnauthorizedWhenNotLoggedIn(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->get();

		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
		self::assertSame(['error' => 'Not logged in'], $response->getData());
	}

	public function testGetReturnsDefaultColumnsWhenNoDataExists(): void {
		$this->mockUser();
		$this->mapper->method('findByUser')->willReturn(null);

		$response = $this->controller->get();

		$expected = array_merge($this->emptyCustomColumns(), ['updatedAt' => 0]);
		self::assertSame(Http::STATUS_OK, $response->getStatus());
		self::assertSame($expected, $response->getData());
	}

	public function testGetReturnsStoredData(): void {
		$this->mockUser();

		$columns = [
			['id' => 'custom_1', 'title' => 'Backlog', 'tasks' => [['text' => 'Item']]],
		];
		$entity = new CustomColumns();
		$entity->setData(json_encode(['columns' => $columns]));
		$entity->setUpdatedAt(500);

		$this->mapper->method('findByUser')
			->with('testuser')
			->willReturn($entity);

		$response = $this->controller->get();

		/** @var array $data */
		$data = $response->getData();
		self::assertSame(500, $data['updatedAt']);
		self::assertSame($columns, $data['columns']);
	}

	public function testGetReturnsDefaultColumnsWhenDataIsInvalidJson(): void {
		$this->mockUser();

		$entity = new CustomColumns();
		$entity->setData('invalid');
		$entity->setUpdatedAt(500);

		$this->mapper->method('findByUser')->willReturn($entity);

		$response = $this->controller->get();

		$expected = array_merge($this->emptyCustomColumns(), ['updatedAt' => 0]);
		self::assertSame($expected, $response->getData());
	}

	// --- put() tests ---

	public function testPutReturnsUnauthorizedWhenNotLoggedIn(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->put([]);

		self::assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
	}

	public function testPutCreatesNewEntityWhenNoneExists(): void {
		$this->mockUser();
		$this->mapper->method('findByUser')->willReturn(null);

		$this->mapper->expects(self::once())
			->method('insert')
			->willReturnCallback(function (CustomColumns $entity): CustomColumns {
				self::assertSame('testuser', $entity->getUserId());
				return $entity;
			});
		$this->mapper->expects(self::never())->method('update');
		$this->notifyPush->expects(self::once())
			->method('notifyCustomColumnsUpdate')
			->with('testuser');

		$columns = [['id' => 'custom_1', 'title' => 'My Column', 'tasks' => []]];
		$response = $this->controller->put($columns);

		/** @var array $data */
		$data = $response->getData();
		self::assertSame('ok', $data['status']);
		self::assertIsInt($data['updatedAt']);
	}

	public function testPutUpdatesExistingEntity(): void {
		$this->mockUser();

		$existing = new CustomColumns();
		$existing->setUserId('testuser');
		$existing->setData('{}');
		$existing->setUpdatedAt(100);

		$this->mapper->method('findByUser')->willReturn($existing);

		$this->mapper->expects(self::once())
			->method('update')
			->willReturnCallback(function (CustomColumns $entity) use ($existing): CustomColumns {
				self::assertSame($existing, $entity);
				self::assertGreaterThan(100, $entity->getUpdatedAt());
				return $entity;
			});
		$this->mapper->expects(self::never())->method('insert');

		$response = $this->controller->put([]);

		/** @var array $data */
		$data = $response->getData();
		self::assertSame('ok', $data['status']);
	}

	// --- poll() tests ---

	public function testPollReturnsUnauthorizedWhenNotLoggedIn(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->poll(0);

		self::assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
	}

	public function testPollReturnsChangedDataImmediatelyWhenUpdated(): void {
		$this->mockUser();

		$columnsData = ['columns' => [['id' => 'custom_1', 'title' => 'Updated', 'tasks' => []]]];
		$entity = new CustomColumns();
		$entity->setData(json_encode($columnsData));
		$entity->setUpdatedAt(300);

		$this->mapper->method('getUpdatedAt')
			->with('testuser')
			->willReturn(300);

		$this->mapper->method('findByUser')
			->with('testuser')
			->willReturn($entity);

		$response = $this->controller->poll(100);

		/** @var array $data */
		$data = $response->getData();
		self::assertTrue($data['changed']);
		self::assertSame(300, $data['updatedAt']);
		self::assertSame($columnsData, $data['data']);
	}

	public function testPollReturnsDefaultColumnsWhenEntityIsNull(): void {
		$this->mockUser();

		$this->mapper->method('getUpdatedAt')->willReturn(200);
		$this->mapper->method('findByUser')->willReturn(null);

		$response = $this->controller->poll(100);

		/** @var array $data */
		$data = $response->getData();
		self::assertTrue($data['changed']);
		self::assertSame($this->emptyCustomColumns(), $data['data']);
	}
}
