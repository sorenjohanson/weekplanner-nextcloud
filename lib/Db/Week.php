<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method int getYear()
 * @method void setYear(int $year)
 * @method int getWeek()
 * @method void setWeek(int $week)
 * @method string getData()
 * @method void setData(string $data)
 */
class Week extends Entity {
	protected string $userId = '';
	protected int $year = 0;
	protected int $week = 0;
	protected string $data = '{}';

	public function __construct() {
		$this->addType('userId', 'string');
		$this->addType('year', 'integer');
		$this->addType('week', 'integer');
		$this->addType('data', 'string');
	}
}
