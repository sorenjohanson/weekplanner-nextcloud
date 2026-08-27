<?php

declare(strict_types=1);

namespace OCA\WeekPlanner\Tests\UserMigration;

use OCA\WeekPlanner\Db\CustomColumns;
use OCA\WeekPlanner\Db\CustomColumnsMapper;
use OCA\WeekPlanner\Db\Week;
use OCA\WeekPlanner\Db\WeekMapper;
use OCA\WeekPlanner\UserMigration\WeekPlannerMigrator;
use OCA\WeekPlanner\UserMigration\WeekPlannerMigratorException;
use OCP\App\IAppManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\UserMigration\IExportDestination;
use OCP\UserMigration\IImportSource;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Output\NullOutput;

/**
 * @psalm-suppress PropertyNotSetInConstructor
 */
class WeekPlannerMigratorTest extends TestCase {
	private IAppManager&MockObject $appManager;
	private WeekMapper&MockObject $weekMapper;
	private CustomColumnsMapper&MockObject $customColumnsMapper;
	private IL10N&MockObject $l10n;
	private WeekPlannerMigrator $migrator;

	protected function setUp(): void {
		$this->appManager = $this->createMock(IAppManager::class);
		$this->weekMapper = $this->createMock(WeekMapper::class);
		$this->customColumnsMapper = $this->createMock(CustomColumnsMapper::class);
		$this->l10n = $this->createMock(IL10N::class);
		$this->l10n->method('t')->willReturnCallback(fn (string $s) => $s);

		$this->migrator = new WeekPlannerMigrator(
			$this->appManager,
			$this->weekMapper,
			$this->customColumnsMapper,
			$this->l10n,
		);
	}

	private function mockUser(string $uid = 'alice'): IUser&MockObject {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn($uid);
		return $user;
	}

	private function makeWeek(string $uid, int $year, int $week, string $data, int $updatedAt): Week {
		$entity = new Week();
		$entity->setUserId($uid);
		$entity->setYear($year);
		$entity->setWeek($week);
		$entity->setData($data);
		$entity->setUpdatedAt($updatedAt);
		return $entity;
	}

	// --- Metadata ---

	public function testGetIdIsStable(): void {
		self::assertSame('weekplanner', $this->migrator->getId());
	}

	public function testGetVersionIsOne(): void {
		self::assertSame(1, $this->migrator->getVersion());
	}

	public function testDisplayNameAndDescriptionAreLocalised(): void {
		self::assertSame('Week Planner', $this->migrator->getDisplayName());
		self::assertSame('Weekly planner tasks and custom column settings', $this->migrator->getDescription());
	}

	public function testCanImportAcceptsMatchingVersion(): void {
		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->with('weekplanner')->willReturn(1);
		self::assertTrue($this->migrator->canImport($importSource));
	}

	public function testCanImportRejectsNewerVersion(): void {
		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->with('weekplanner')->willReturn(99);
		self::assertFalse($this->migrator->canImport($importSource));
	}

	public function testCanImportAcceptsMissingVersionByDefault(): void {
		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->with('weekplanner')->willReturn(null);
		self::assertTrue($this->migrator->canImport($importSource));
	}

	// --- Export ---

	public function testExportWritesVersionWeeksAndCustomColumns(): void {
		$user = $this->mockUser();
		$this->appManager->method('getAppVersion')->with('weekplanner')->willReturn('1.14.0');

		$this->weekMapper->method('findAllByUser')->with('alice')->willReturn([
			$this->makeWeek('alice', 2026, 12, '{"days":{"monday":[{"text":"a"}]}}', 100),
			$this->makeWeek('alice', 2026, 13, '{"days":{"tuesday":[]}}', 200),
		]);

		$cc = new CustomColumns();
		$cc->setUserId('alice');
		$cc->setData('{"columns":[{"id":"custom_1","title":"Backlog","tasks":[]}]}');
		$cc->setUpdatedAt(300);
		$this->customColumnsMapper->method('findByUser')->with('alice')->willReturn($cc);

		$writes = [];
		$destination = $this->createMock(IExportDestination::class);
		$destination->method('addFileContents')
			->willReturnCallback(function (string $path, string $content) use (&$writes): void {
				$writes[$path] = $content;
			});

		$this->migrator->export($user, $destination, new NullOutput());

		self::assertArrayHasKey('weekplanner/version.json', $writes);
		self::assertSame(['appVersion' => '1.14.0'], json_decode($writes['weekplanner/version.json'], true));

		self::assertArrayHasKey('weekplanner/weeks.json', $writes);
		/** @var array<array<string,mixed>> $weeks */
		$weeks = json_decode($writes['weekplanner/weeks.json'], true);
		self::assertCount(2, $weeks);
		self::assertSame(2026, $weeks[0]['year']);
		self::assertSame(12, $weeks[0]['week']);
		self::assertSame('{"days":{"monday":[{"text":"a"}]}}', $weeks[0]['data']);
		self::assertSame(100, $weeks[0]['updatedAt']);

		self::assertArrayHasKey('weekplanner/custom_columns.json', $writes);
		self::assertSame(
			[
				'data' => '{"columns":[{"id":"custom_1","title":"Backlog","tasks":[]}]}',
				'updatedAt' => 300,
			],
			json_decode($writes['weekplanner/custom_columns.json'], true),
		);
	}

	public function testExportSkipsCustomColumnsWhenNone(): void {
		$user = $this->mockUser();
		$this->appManager->method('getAppVersion')->willReturn('1.14.0');
		$this->weekMapper->method('findAllByUser')->willReturn([]);
		$this->customColumnsMapper->method('findByUser')->with('alice')->willReturn(null);

		$writes = [];
		$destination = $this->createMock(IExportDestination::class);
		$destination->method('addFileContents')
			->willReturnCallback(function (string $path, string $content) use (&$writes): void {
				$writes[$path] = $content;
			});

		$this->migrator->export($user, $destination, new NullOutput());

		self::assertArrayHasKey('weekplanner/weeks.json', $writes);
		self::assertSame('[]', $writes['weekplanner/weeks.json']);
		self::assertArrayNotHasKey('weekplanner/custom_columns.json', $writes);
	}

	// --- Import ---

	public function testImportSkipsWhenMigratorMissingFromArchive(): void {
		$user = $this->mockUser();
		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->with('weekplanner')->willReturn(null);

		$importSource->expects(self::never())->method('pathExists');
		$this->weekMapper->expects(self::never())->method('insert');
		$this->customColumnsMapper->expects(self::never())->method('insert');

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportInsertsNewWeeksAndCustomColumns(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->with('weekplanner')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', true],
			['weekplanner/custom_columns.json', true],
		]);
		$importSource->method('getFileContents')->willReturnMap([
			['weekplanner/weeks.json', json_encode([
				['year' => 2026, 'week' => 12, 'data' => '{"days":{}}', 'updatedAt' => 500],
			])],
			['weekplanner/custom_columns.json', json_encode(['data' => '{"columns":[]}', 'updatedAt' => 700])],
		]);

		$this->weekMapper->method('findByUserAndWeek')->willReturn(null);
		$this->weekMapper->expects(self::once())
			->method('insert')
			->willReturnCallback(function (Week $entity): Week {
				self::assertSame('alice', $entity->getUserId());
				self::assertSame(2026, $entity->getYear());
				self::assertSame(12, $entity->getWeek());
				self::assertSame('{"days":{}}', $entity->getData());
				self::assertSame(500, $entity->getUpdatedAt());
				return $entity;
			});

		$this->customColumnsMapper->method('findByUser')->willReturn(null);
		$this->customColumnsMapper->expects(self::once())
			->method('insert')
			->willReturnCallback(function (CustomColumns $entity): CustomColumns {
				self::assertSame('alice', $entity->getUserId());
				self::assertSame('{"columns":[]}', $entity->getData());
				self::assertSame(700, $entity->getUpdatedAt());
				return $entity;
			});

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportKeepsNewerLocalWeek(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', true],
			['weekplanner/custom_columns.json', false],
		]);
		$importSource->method('getFileContents')->willReturn(json_encode([
			['year' => 2026, 'week' => 12, 'data' => '{"days":{"monday":[{"text":"old"}]}}', 'updatedAt' => 100],
		]));

		$existing = $this->makeWeek('alice', 2026, 12, '{"days":{"monday":[{"text":"newer"}]}}', 999);
		$this->weekMapper->method('findByUserAndWeek')
			->with('alice', 2026, 12)
			->willReturn($existing);

		$this->weekMapper->expects(self::never())->method('update');
		$this->weekMapper->expects(self::never())->method('insert');

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportOverwritesOlderLocalWeek(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', true],
			['weekplanner/custom_columns.json', false],
		]);
		$importSource->method('getFileContents')->willReturn(json_encode([
			['year' => 2026, 'week' => 12, 'data' => '{"days":{"monday":[{"text":"new"}]}}', 'updatedAt' => 999],
		]));

		$existing = $this->makeWeek('alice', 2026, 12, '{"days":{"monday":[{"text":"old"}]}}', 100);
		$this->weekMapper->method('findByUserAndWeek')->willReturn($existing);

		$this->weekMapper->expects(self::once())
			->method('update')
			->willReturnCallback(function (Week $entity): Week {
				self::assertSame('{"days":{"monday":[{"text":"new"}]}}', $entity->getData());
				self::assertSame(999, $entity->getUpdatedAt());
				return $entity;
			});
		$this->weekMapper->expects(self::never())->method('insert');

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportOverwritesCustomColumnsUnconditionally(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', false],
			['weekplanner/custom_columns.json', true],
		]);
		$importSource->method('getFileContents')
			->with('weekplanner/custom_columns.json')
			->willReturn(json_encode(['data' => '{"columns":[{"id":"custom_1","title":"Imported","tasks":[]}]}', 'updatedAt' => 50]));

		// Local is newer, but we overwrite anyway per policy.
		$existing = new CustomColumns();
		$existing->setUserId('alice');
		$existing->setData('{"columns":[{"id":"custom_1","title":"Local","tasks":[]}]}');
		$existing->setUpdatedAt(9999);
		$this->customColumnsMapper->method('findByUser')->willReturn($existing);

		$this->customColumnsMapper->expects(self::once())
			->method('update')
			->willReturnCallback(function (CustomColumns $entity): CustomColumns {
				self::assertSame('{"columns":[{"id":"custom_1","title":"Imported","tasks":[]}]}', $entity->getData());
				self::assertSame(50, $entity->getUpdatedAt());
				return $entity;
			});
		$this->customColumnsMapper->expects(self::never())->method('insert');

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportSkipsMissingArchiveFiles(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturn(false);

		$this->weekMapper->expects(self::never())->method('insert');
		$this->weekMapper->expects(self::never())->method('update');
		$this->customColumnsMapper->expects(self::never())->method('insert');
		$this->customColumnsMapper->expects(self::never())->method('update');

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportSkipsMalformedWeekEntries(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', true],
			['weekplanner/custom_columns.json', false],
		]);
		$importSource->method('getFileContents')->willReturn(json_encode([
			['year' => 2026, 'week' => 12, 'data' => '{}', 'updatedAt' => 100], // valid
			['week' => 13], // missing fields
			['year' => 'nope', 'week' => 14, 'data' => '{}', 'updatedAt' => 5], // wrong type
		]));

		$this->weekMapper->method('findByUserAndWeek')->willReturn(null);
		$this->weekMapper->expects(self::once())->method('insert');

		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportThrowsOnInvalidWeeksPayload(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', true],
			['weekplanner/custom_columns.json', false],
		]);
		$importSource->method('getFileContents')->willReturn('not json');

		$this->expectException(WeekPlannerMigratorException::class);
		$this->migrator->import($user, $importSource, new NullOutput());
	}

	public function testImportThrowsOnInvalidCustomColumnsPayload(): void {
		$user = $this->mockUser();

		$importSource = $this->createMock(IImportSource::class);
		$importSource->method('getMigratorVersion')->willReturn(1);
		$importSource->method('pathExists')->willReturnMap([
			['weekplanner/weeks.json', false],
			['weekplanner/custom_columns.json', true],
		]);
		$importSource->method('getFileContents')->willReturn(json_encode(['not' => 'right']));

		$this->expectException(WeekPlannerMigratorException::class);
		$this->migrator->import($user, $importSource, new NullOutput());
	}

	// --- Size estimation ---

	public function testGetEstimatedExportSizeReturnsAtLeastVersionOverhead(): void {
		$user = $this->mockUser();
		$this->weekMapper->method('findAllByUser')->willReturn([]);
		$this->customColumnsMapper->method('findByUser')->willReturn(null);

		self::assertGreaterThanOrEqual(1, $this->migrator->getEstimatedExportSize($user));
	}

	public function testGetEstimatedExportSizeGrowsWithData(): void {
		$user = $this->mockUser();
		$big = str_repeat('x', 4096);
		$this->weekMapper->method('findAllByUser')->willReturn([
			$this->makeWeek('alice', 2026, 12, $big, 100),
			$this->makeWeek('alice', 2026, 13, $big, 200),
		]);
		$this->customColumnsMapper->method('findByUser')->willReturn(null);

		self::assertGreaterThanOrEqual(8, $this->migrator->getEstimatedExportSize($user));
	}
}
