<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Tests\Controller;

use OCA\WeekPlanner\Controller\PageController;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

/**
 * @psalm-suppress PropertyNotSetInConstructor
 */
class PageControllerTest extends TestCase {
	private PageController $controller;

	protected function setUp(): void {
		$this->controller = new PageController(
			'weekplanner',
			$this->createMock(IRequest::class),
		);
	}

	public function testIndexReturnsTemplateResponse(): void {
		$response = $this->controller->index();

		self::assertInstanceOf(TemplateResponse::class, $response);
		self::assertSame('index', $response->getTemplateName());
		self::assertSame('weekplanner', $response->getApp());
	}
}
