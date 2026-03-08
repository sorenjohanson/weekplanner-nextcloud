<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<CustomColumns>
 */
class CustomColumnsMapper extends QBMapper {
	/**
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'weekplanner_custom_cols', CustomColumns::class);
	}

	public function findByUser(string $userId): ?CustomColumns {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}
}
