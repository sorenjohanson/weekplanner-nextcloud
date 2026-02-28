<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<Week>
 */
class WeekMapper extends QBMapper {
	/**
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'weekplanner_weeks', Week::class);
	}

	public function findByUserAndWeek(string $userId, int $year, int $week): ?Week {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('week', $qb->createNamedParameter($week, IQueryBuilder::PARAM_INT)));

		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}
}
