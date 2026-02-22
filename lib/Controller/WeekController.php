<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Controller;

use OCA\WeekPlanner\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * @psalm-suppress UnusedClass
 */
class WeekController extends Controller {
	public function __construct(
		IRequest $request,
		private IRootFolder $rootFolder,
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

		$userFolder = $this->rootFolder->getUserFolder($user->getUID());
		$fileName = sprintf('weekplanner/%d-W%02d.json', $year, $week);

		try {
			if ($userFolder->nodeExists($fileName)) {
				$file = $userFolder->get($fileName);
				$data = json_decode($file->getContent(), true);
				if (is_array($data)) {
					return new JSONResponse($data);
				}
			}
		} catch (\Exception $e) {
			// File doesn't exist or can't be read, return empty week
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

		$userFolder = $this->rootFolder->getUserFolder($user->getUID());
		$data = ['days' => $days];

		if (!$userFolder->nodeExists('weekplanner')) {
			$userFolder->newFolder('weekplanner');
		}

		$fileName = sprintf('weekplanner/%d-W%02d.json', $year, $week);
		$jsonContent = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

		if ($userFolder->nodeExists($fileName)) {
			$file = $userFolder->get($fileName);
			$file->putContent($jsonContent);
		} else {
			$folder = $userFolder->get('weekplanner');
			$file = $folder->newFile(sprintf('%d-W%02d.json', $year, $week));
			$file->putContent($jsonContent);
		}

		return new JSONResponse(['status' => 'ok']);
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
