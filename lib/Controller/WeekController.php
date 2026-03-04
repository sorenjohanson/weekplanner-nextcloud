<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Controller;

use OCA\WeekPlanner\AppInfo\Application;
use OCA\WeekPlanner\Db\Week;
use OCA\WeekPlanner\Db\WeekMapper;
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
class WeekController extends Controller {
	public function __construct(
		IRequest $request,
		private WeekMapper $weekMapper,
		private IUserSession $userSession,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'GET', url: '/week/{year}/{week}')]
	public function get(int $year, int $week): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['error' => 'Not logged in'], Http::STATUS_UNAUTHORIZED);
		}

		$entity = $this->weekMapper->findByUserAndWeek($user->getUID(), $year, $week);
		if ($entity !== null) {
			/** @psalm-suppress MixedAssignment */
			$data = json_decode($entity->getData(), true);
			if (is_array($data)) {
				return new JSONResponse($data);
			}
		}

		return new JSONResponse($this->emptyWeek());
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'PUT', url: '/week/{year}/{week}')]
	public function put(int $year, int $week, array $days = []): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['error' => 'Not logged in'], Http::STATUS_UNAUTHORIZED);
		}

		$userId = $user->getUID();
		$jsonData = json_encode(['days' => $days], JSON_UNESCAPED_UNICODE);

		$now = time();
		$existing = $this->weekMapper->findByUserAndWeek($userId, $year, $week);
		if ($existing !== null) {
			$existing->setData($jsonData);
			$existing->setUpdatedAt($now);
			$this->weekMapper->update($existing);
		} else {
			$entity = new Week();
			$entity->setUserId($userId);
			$entity->setYear($year);
			$entity->setWeek($week);
			$entity->setData($jsonData);
			$entity->setUpdatedAt($now);
			$this->weekMapper->insert($entity);
		}

		return new JSONResponse(['status' => 'ok']);
	}

	#[NoAdminRequired]
	#[FrontpageRoute(verb: 'GET', url: '/week/{year}/{week}/poll')]
	public function poll(int $year, int $week, int $since = 0): JSONResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['error' => 'Not logged in'], Http::STATUS_UNAUTHORIZED);
		}

		session_write_close();
		set_time_limit(60);

		$userId = $user->getUID();
		$start = time();

		while (time() - $start < 30) {
			$updatedAt = $this->weekMapper->getUpdatedAt($userId, $year, $week);

			if ($updatedAt > $since) {
				$entity = $this->weekMapper->findByUserAndWeek($userId, $year, $week);
				/** @psalm-suppress MixedAssignment */
				$data = $entity !== null ? (json_decode($entity->getData(), true) ?: $this->emptyWeek()) : $this->emptyWeek();
				return new JSONResponse([
					'changed' => true,
					'updatedAt' => $updatedAt,
					'data' => $data,
				]);
			}

			sleep(1);
		}

		return new JSONResponse(['changed' => false, 'updatedAt' => $since]);
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
}
