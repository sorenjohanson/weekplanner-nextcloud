<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\UserMigration;

use OCA\WeekPlanner\AppInfo\Application;
use OCA\WeekPlanner\Db\CustomColumns;
use OCA\WeekPlanner\Db\CustomColumnsMapper;
use OCA\WeekPlanner\Db\Week;
use OCA\WeekPlanner\Db\WeekMapper;
use OCP\App\IAppManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\UserMigration\IExportDestination;
use OCP\UserMigration\IImportSource;
use OCP\UserMigration\IMigrator;
use OCP\UserMigration\ISizeEstimationMigrator;
use OCP\UserMigration\TMigratorBasicVersionHandling;
use Symfony\Component\Console\Output\OutputInterface;
use Throwable;

class WeekPlannerMigrator implements IMigrator, ISizeEstimationMigrator {
	use TMigratorBasicVersionHandling;

	private const PATH_ROOT = Application::APP_ID . '/';
	private const PATH_VERSION = self::PATH_ROOT . 'version.json';
	private const PATH_WEEKS = self::PATH_ROOT . 'weeks.json';
	private const PATH_CUSTOM_COLUMNS = self::PATH_ROOT . 'custom_columns.json';

	public function __construct(
		private readonly IAppManager $appManager,
		private readonly WeekMapper $weekMapper,
		private readonly CustomColumnsMapper $customColumnsMapper,
		private readonly IL10N $l10n,
	) {
		$this->version = 1;
	}

	public function getId(): string {
		return 'weekplanner';
	}

	public function getDisplayName(): string {
		return $this->l10n->t('Week Planner');
	}

	public function getDescription(): string {
		return $this->l10n->t('Weekly planner tasks and custom column settings');
	}

	public function getEstimatedExportSize(IUser $user): int|float {
		$userId = $user->getUID();
		$bytes = 0;

		try {
			foreach ($this->weekMapper->findAllByUser($userId) as $week) {
				// row payload + ~100B of JSON scaffolding per row
				$bytes += strlen($week->getData()) + 100;
			}
		} catch (Throwable) {
			// Estimate best-effort; ignore
		}

		try {
			$cc = $this->customColumnsMapper->findByUser($userId);
			if ($cc !== null) {
				$bytes += strlen($cc->getData()) + 100;
			}
		} catch (Throwable) {
			// Estimate best-effort; ignore
		}

		// version.json overhead
		$bytes += 128;

		return (int)ceil($bytes / 1024);
	}

	public function export(IUser $user, IExportDestination $exportDestination, OutputInterface $output): void {
		$output->writeln('Exporting week planner data…');
		$this->exportVersion($exportDestination);
		$this->exportWeeks($user, $exportDestination, $output);
		$this->exportCustomColumns($user, $exportDestination, $output);
	}

	/**
	 * @throws WeekPlannerMigratorException
	 */
	private function exportVersion(IExportDestination $exportDestination): void {
		try {
			$versionData = [
				'appVersion' => $this->appManager->getAppVersion(Application::APP_ID),
			];
			$exportDestination->addFileContents(self::PATH_VERSION, json_encode($versionData, JSON_THROW_ON_ERROR));
		} catch (Throwable $e) {
			throw new WeekPlannerMigratorException('Could not export week planner version metadata', 0, $e);
		}
	}

	/**
	 * @throws WeekPlannerMigratorException
	 */
	private function exportWeeks(IUser $user, IExportDestination $exportDestination, OutputInterface $output): void {
		$output->writeln('Exporting weeks to ' . self::PATH_WEEKS . '…');
		try {
			$weeks = $this->weekMapper->findAllByUser($user->getUID());
			$exportData = [];
			foreach ($weeks as $week) {
				$exportData[] = [
					'year' => $week->getYear(),
					'week' => $week->getWeek(),
					'data' => $week->getData(),
					'updatedAt' => $week->getUpdatedAt(),
				];
			}
			$exportDestination->addFileContents(
				self::PATH_WEEKS,
				json_encode($exportData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)
			);
			$output->writeln('Exported ' . count($exportData) . ' week(s)…');
		} catch (Throwable $e) {
			throw new WeekPlannerMigratorException('Could not export weeks', 0, $e);
		}
	}

	/**
	 * @throws WeekPlannerMigratorException
	 */
	private function exportCustomColumns(IUser $user, IExportDestination $exportDestination, OutputInterface $output): void {
		$output->writeln('Exporting custom columns to ' . self::PATH_CUSTOM_COLUMNS . '…');
		try {
			$cc = $this->customColumnsMapper->findByUser($user->getUID());
			if ($cc === null) {
				$output->writeln('No custom columns to export…');
				return;
			}
			$exportData = [
				'data' => $cc->getData(),
				'updatedAt' => $cc->getUpdatedAt(),
			];
			$exportDestination->addFileContents(
				self::PATH_CUSTOM_COLUMNS,
				json_encode($exportData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)
			);
			$output->writeln('Exported custom columns…');
		} catch (Throwable $e) {
			throw new WeekPlannerMigratorException('Could not export custom columns', 0, $e);
		}
	}

	public function import(IUser $user, IImportSource $importSource, OutputInterface $output): void {
		$output->writeln('Importing week planner data…');
		if ($importSource->getMigratorVersion($this->getId()) === null) {
			$output->writeln('No version for ' . static::class . ', skipping import…');
			return;
		}
		$this->importWeeks($user, $importSource, $output);
		$this->importCustomColumns($user, $importSource, $output);
	}

	/**
	 * @throws WeekPlannerMigratorException
	 */
	private function importWeeks(IUser $user, IImportSource $importSource, OutputInterface $output): void {
		$output->writeln('Importing weeks from ' . self::PATH_WEEKS . '…');

		if ($importSource->pathExists(self::PATH_WEEKS) === false) {
			$output->writeln('No weeks to import…');
			return;
		}

		try {
			$raw = $importSource->getFileContents(self::PATH_WEEKS);
			if ($raw === '') {
				$output->writeln('No weeks to import…');
				return;
			}

			/** @var mixed $decoded */
			$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
			if (!is_array($decoded)) {
				throw new WeekPlannerMigratorException('Invalid weeks payload in archive');
			}

			$userId = $user->getUID();
			$imported = 0;
			$skipped = 0;
			$failed = 0;

			foreach ($decoded as $row) {
				if (!is_array($row)
					|| !isset($row['year'], $row['week'], $row['data'], $row['updatedAt'])
					|| !is_int($row['year'])
					|| !is_int($row['week'])
					|| !is_string($row['data'])
					|| !is_int($row['updatedAt'])
				) {
					$failed++;
					$output->writeln('Skipping malformed week entry…');
					continue;
				}

				try {
					$existing = $this->weekMapper->findByUserAndWeek($userId, $row['year'], $row['week']);
					if ($existing !== null && $existing->getUpdatedAt() >= $row['updatedAt']) {
						$skipped++;
						continue;
					}

					if ($existing !== null) {
						$existing->setData($row['data']);
						$existing->setUpdatedAt($row['updatedAt']);
						$this->weekMapper->update($existing);
					} else {
						$entity = new Week();
						$entity->setUserId($userId);
						$entity->setYear($row['year']);
						$entity->setWeek($row['week']);
						$entity->setData($row['data']);
						$entity->setUpdatedAt($row['updatedAt']);
						$this->weekMapper->insert($entity);
					}
					$imported++;
				} catch (Throwable $e) {
					$failed++;
					$output->writeln('Failed to import week ' . $row['year'] . '-W' . $row['week'] . ': ' . $e->getMessage());
				}
			}

			$output->writeln("Weeks: $imported imported, $skipped skipped (local newer), $failed failed");
		} catch (WeekPlannerMigratorException $e) {
			throw $e;
		} catch (Throwable $e) {
			throw new WeekPlannerMigratorException('Could not import weeks', 0, $e);
		}
	}

	/**
	 * @throws WeekPlannerMigratorException
	 */
	private function importCustomColumns(IUser $user, IImportSource $importSource, OutputInterface $output): void {
		$output->writeln('Importing custom columns from ' . self::PATH_CUSTOM_COLUMNS . '…');

		if ($importSource->pathExists(self::PATH_CUSTOM_COLUMNS) === false) {
			$output->writeln('No custom columns to import…');
			return;
		}

		try {
			$raw = $importSource->getFileContents(self::PATH_CUSTOM_COLUMNS);
			if ($raw === '') {
				$output->writeln('No custom columns to import…');
				return;
			}

			/** @var mixed $decoded */
			$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
			if (!is_array($decoded)
				|| !isset($decoded['data'], $decoded['updatedAt'])
				|| !is_string($decoded['data'])
				|| !is_int($decoded['updatedAt'])
			) {
				throw new WeekPlannerMigratorException('Invalid custom columns payload in archive');
			}

			$userId = $user->getUID();
			$existing = $this->customColumnsMapper->findByUser($userId);
			if ($existing !== null) {
				$existing->setData($decoded['data']);
				$existing->setUpdatedAt($decoded['updatedAt']);
				$this->customColumnsMapper->update($existing);
			} else {
				$entity = new CustomColumns();
				$entity->setUserId($userId);
				$entity->setData($decoded['data']);
				$entity->setUpdatedAt($decoded['updatedAt']);
				$this->customColumnsMapper->insert($entity);
			}

			$output->writeln('Imported custom columns (overwritten)…');
		} catch (WeekPlannerMigratorException $e) {
			throw $e;
		} catch (Throwable $e) {
			throw new WeekPlannerMigratorException('Could not import custom columns', 0, $e);
		}
	}
}
