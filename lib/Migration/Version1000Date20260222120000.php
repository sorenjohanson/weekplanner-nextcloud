<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * @psalm-suppress UnusedClass
 */
class Version1000Date20260222120000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if (!$schema->hasTable('weekplanner_weeks')) {
			$table = $schema->createTable('weekplanner_weeks');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 8,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->addColumn('year', Types::INTEGER, [
				'notnull' => true,
			]);
			$table->addColumn('week', Types::INTEGER, [
				'notnull' => true,
			]);
			$table->addColumn('data', Types::TEXT, [
				'notnull' => true,
				'default' => '{}',
			]);
			$table->setPrimaryKey(['id']);
			$table->addUniqueIndex(['user_id', 'year', 'week'], 'weekplanner_user_year_week');
		}

		return $schema;
	}
}
