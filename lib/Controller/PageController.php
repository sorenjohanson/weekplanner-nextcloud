<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Controller;

use OCA\WeekPlanner\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * @psalm-suppress UnusedClass
 */
class PageController extends Controller {
	public function __construct(
		IRequest $request,
		private IInitialState $initialState,
		private IConfig $config,
		private IUserSession $userSession,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	#[OpenAPI(OpenAPI::SCOPE_IGNORE)]
	#[FrontpageRoute(verb: 'GET', url: '/')]
	public function index(): TemplateResponse {
		$this->initialState->provideInitialState(
			'firstDayOfWeek',
			$this->resolveFirstDayOfWeek(),
		);

		return new TemplateResponse(
			Application::APP_ID,
			'index',
		);
	}

	/**
	 * Resolve the user's preferred first day of week as 0..6 where 0=Sunday and 6=Saturday.
	 *
	 * Nextcloud's "Personal settings > Region & language > First day of week" stores
	 * the value under `core.first_day_of_week`. We honour that, then fall back to a
	 * weekplanner-specific override (set via occ for environments where the personal
	 * setting isn't available), then Monday (ISO 8601 default).
	 *
	 * IConfig::getUserValue is marked deprecated in newer OCP versions in favour of
	 * `OCP\Config\IUserConfig`, but that interface didn't exist in NC 31 (it was at
	 * `NCU\Config\IUserConfig`, marked experimental, and gets deprecated again once
	 * promoted). Until min-version moves past the experimental NCU interface, the
	 * stable IConfig method is the only API that works across the full 31-34 matrix.
	 *
	 * @psalm-suppress DeprecatedMethod
	 */
	private function resolveFirstDayOfWeek(): int {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return 1;
		}

		$uid = $user->getUID();
		$candidates = [
			['core', 'first_day_of_week'],
			[Application::APP_ID, 'firstDayOfWeek'],
		];
		foreach ($candidates as [$app, $key]) {
			$value = $this->config->getUserValue($uid, $app, $key, '');
			if ($value === '' || !is_numeric($value)) {
				continue;
			}
			$intValue = (int)$value;
			if ($intValue >= 0 && $intValue <= 6) {
				return $intValue;
			}
		}
		return 1;
	}
}
