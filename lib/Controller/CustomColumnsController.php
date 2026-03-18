<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Controller;

use OCA\WeekPlanner\AppInfo\Application;
use OCA\WeekPlanner\Db\CustomColumns;
use OCA\WeekPlanner\Db\CustomColumnsMapper;
use OCA\WeekPlanner\Service\NotifyPushService;
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
		private NotifyPushService $notifyPush,
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
				$data['updatedAt'] = $entity->getUpdatedAt();
				return new JSONResponse($data);
			}
		}

		return new JSONResponse(array_merge($this->emptyCustomColumns(), ['updatedAt' => 0]));
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

		$this->notifyPush->notifyCustomColumnsUpdate($userId);

		return new JSONResponse(['status' => 'ok', 'updatedAt' => $now]);
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'GET', url: '/custom-columns/poll')]
	public function poll(int $since = 0): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['error' => 'Not logged in'], Http::STATUS_UNAUTHORIZED);
		}

		session_write_close();
		set_time_limit(60);

		$userId = $user->getUID();
		$start = time();

		while (time() - $start < 30) {
			$updatedAt = $this->mapper->getUpdatedAt($userId);

			if ($updatedAt > $since) {
				$entity = $this->mapper->findByUser($userId);
				/** @psalm-suppress MixedAssignment */
				$data = $entity !== null ? (json_decode($entity->getData(), true) ?: $this->emptyCustomColumns()) : $this->emptyCustomColumns();
				return new JSONResponse([
					'changed' => true,
					'updatedAt' => $updatedAt,
					'data' => $data,
				]);
			}

			sleep(3);
		}

		return new JSONResponse(['changed' => false, 'updatedAt' => $since]);
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
