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
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 * @psalm-suppress PropertyNotSetInConstructor
 */
class Week extends Entity {
	/** @psalm-suppress PossiblyUnusedProperty */
	protected string $userId = '';
	/** @psalm-suppress PossiblyUnusedProperty */
	protected int $year = 0;
	/** @psalm-suppress PossiblyUnusedProperty */
	protected int $week = 0;
	/** @psalm-suppress PossiblyUnusedProperty */
	protected string $data = '{}';
	/** @psalm-suppress PossiblyUnusedProperty */
	protected int $updatedAt = 0;

	public function __construct() {
		$this->addType('userId', 'string');
		$this->addType('year', 'integer');
		$this->addType('week', 'integer');
		$this->addType('data', 'string');
		$this->addType('updatedAt', 'integer');
	}
}
