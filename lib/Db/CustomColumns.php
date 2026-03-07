<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getData()
 * @method void setData(string $data)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 * @psalm-suppress PropertyNotSetInConstructor
 */
class CustomColumns extends Entity {
	/** @psalm-suppress PossiblyUnusedProperty */
	protected string $userId = '';
	/** @psalm-suppress PossiblyUnusedProperty */
	protected string $data = '{}';
	/** @psalm-suppress PossiblyUnusedProperty */
	protected int $updatedAt = 0;

	public function __construct() {
		$this->addType('userId', 'string');
		$this->addType('data', 'string');
		$this->addType('updatedAt', 'integer');
	}
}
