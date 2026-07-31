<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Tests\Controller;

use OCA\WeekPlanner\Controller\PageController;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * @psalm-suppress PropertyNotSetInConstructor
 */
class PageControllerTest extends TestCase {
	private PageController $controller;
	private IInitialState&MockObject $initialState;
	private IConfig&MockObject $config;
	private IUserSession&MockObject $userSession;

	protected function setUp(): void {
		$this->initialState = $this->createMock(IInitialState::class);
		$this->config = $this->createMock(IConfig::class);
		$this->userSession = $this->createMock(IUserSession::class);
		$this->controller = new PageController(
			$this->createMock(IRequest::class),
			$this->initialState,
			$this->config,
			$this->userSession,
		);
	}

	public function testIndexReturnsTemplateResponse(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$response = $this->controller->index();

		self::assertInstanceOf(TemplateResponse::class, $response);
		self::assertSame('index', $response->getTemplateName());
		self::assertSame('weekplanner', $response->getApp());
	}

	public function testIndexInjectsFirstDayOfWeekFromCorePersonalSetting(): void {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('alice');
		$this->userSession->method('getUser')->willReturn($user);

		$this->config->method('getUserValue')
			->willReturnCallback(function (string $uid, string $app, string $key, string $default): string {
				if ($uid === 'alice' && $app === 'core' && $key === 'first_day_of_week') {
					return '5'; // Friday
				}
				return $default;
			});

		$this->initialState->expects(self::once())
			->method('provideInitialState')
			->with('firstDayOfWeek', 5);

		$this->controller->index();
	}

	public function testIndexFallsBackToWeekplannerOverride(): void {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('alice');
		$this->userSession->method('getUser')->willReturn($user);

		$this->config->method('getUserValue')
			->willReturnCallback(function (string $uid, string $app, string $key, string $default): string {
				if ($app === 'weekplanner' && $key === 'firstDayOfWeek') {
					return '6'; // Saturday
				}
				return $default;
			});

		$this->initialState->expects(self::once())
			->method('provideInitialState')
			->with('firstDayOfWeek', 6);

		$this->controller->index();
	}

	public function testIndexDefaultsToMondayWhenNoUser(): void {
		$this->userSession->method('getUser')->willReturn(null);

		$this->initialState->expects(self::once())
			->method('provideInitialState')
			->with('firstDayOfWeek', 1);

		$this->controller->index();
	}

	public function testIndexDefaultsToMondayWhenStoredValueIsInvalid(): void {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('alice');
		$this->userSession->method('getUser')->willReturn($user);

		$this->config->method('getUserValue')
			->willReturnCallback(function (string $uid, string $app, string $key, string $default): string {
				if ($app === 'core' && $key === 'first_day_of_week') {
					return '99'; // out of range
				}
				return $default;
			});

		$this->initialState->expects(self::once())
			->method('provideInitialState')
			->with('firstDayOfWeek', 1);

		$this->controller->index();
	}
}
