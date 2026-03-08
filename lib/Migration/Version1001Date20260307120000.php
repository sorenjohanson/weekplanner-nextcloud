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
 * @psalm-suppress UndefinedDocblockClass
 */
class Version1001Date20260307120000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		$schema = $schemaClosure();

		if (!$schema->hasTable('weekplanner_custom_cols')) {
			$table = $schema->createTable('weekplanner_custom_cols');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'length' => 8,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->addColumn('data', Types::TEXT, [
				'notnull' => true,
				'default' => '{}',
			]);
			$table->addColumn('updated_at', Types::BIGINT, [
				'notnull' => true,
				'default' => 0,
			]);
			$table->setPrimaryKey(['id']);
			$table->addUniqueIndex(['user_id'], 'weekplanner_custom_cols_user');
		}

		return $schema;
	}
}
