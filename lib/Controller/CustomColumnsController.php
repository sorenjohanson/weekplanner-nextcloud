<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Controller;

use OCA\WeekPlanner\AppInfo\Application;
use OCA\WeekPlanner\Db\CustomColumns;
use OCA\WeekPlanner\Db\CustomColumnsMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * @psalm-suppress UnusedClass
 */
class CustomColumnsController extends Controller {
	public function __construct(
		IRequest $request,
		private CustomColumnsMapper $mapper,
		private IUserSession $userSession,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'GET', url: '/custom-columns')]
	public function get(): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['error' => 'Not logged in'], Http::STATUS_UNAUTHORIZED);
		}

		$entity = $this->mapper->findByUser($user->getUID());
		if ($entity !== null) {
			/** @psalm-suppress MixedAssignment */
			$data = json_decode($entity->getData(), true);
			if (is_array($data)) {
				return new JSONResponse($data);
			}
		}

		return new JSONResponse($this->emptyCustomColumns());
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'PUT', url: '/custom-columns')]
	public function put(array $columns = []): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['error' => 'Not logged in'], Http::STATUS_UNAUTHORIZED);
		}

		$userId = $user->getUID();
		$jsonData = json_encode(['columns' => $columns], JSON_UNESCAPED_UNICODE);

		$now = time();
		$existing = $this->mapper->findByUser($userId);
		if ($existing !== null) {
			$existing->setData($jsonData);
			$existing->setUpdatedAt($now);
			$this->mapper->update($existing);
		} else {
			$entity = new CustomColumns();
			$entity->setUserId($userId);
			$entity->setData($jsonData);
			$entity->setUpdatedAt($now);
			$this->mapper->insert($entity);
		}

		return new JSONResponse(['status' => 'ok']);
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
}
