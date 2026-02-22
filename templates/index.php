<?php

declare(strict_types=1);

use OCP\Util;

Util::addScript(OCA\WeekPlanner\AppInfo\Application::APP_ID, OCA\WeekPlanner\AppInfo\Application::APP_ID . '-main');
Util::addStyle(OCA\WeekPlanner\AppInfo\Application::APP_ID, OCA\WeekPlanner\AppInfo\Application::APP_ID . '-main');

?>

<div id="weekplanner"></div>
