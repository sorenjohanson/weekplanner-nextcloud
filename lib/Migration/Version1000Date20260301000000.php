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
class Version1000Date20260301000000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		$schema = $schemaClosure();

		if ($schema->hasTable('weekplanner_weeks')) {
			$table = $schema->getTable('weekplanner_weeks');
			if (!$table->hasColumn('updated_at')) {
				$table->addColumn('updated_at', Types::BIGINT, [
					'notnull' => true,
					'default' => 0,
				]);
			}
		}

		return $schema;
	}
}
