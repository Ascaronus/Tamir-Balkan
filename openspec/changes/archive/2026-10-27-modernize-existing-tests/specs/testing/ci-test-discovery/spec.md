# Spec Delta: ci-test-discovery

## ADDED Requirements

### Requirement: Backend tests are discovered in CI without a manual file list

Workflow `Verify storefront and backend` SHALL обнаруживать тесты `backend/tests/`
по шаблону имени файла, а не ручным списком. Добавление нового файла
`*.test.cjs` или `*.integration.cjs` SHALL приводить к его запуску в CI без
редактирования workflow.

#### Scenario: New file is picked up automatically
- **WHEN** в pull request добавлен `backend/tests/новый-кейс.test.cjs`
- **THEN** CI исполняет его, не требуя изменений в `.github/workflows/verify.yml`

#### Scenario: File outside the pattern stays visible
- **WHEN** в `backend/tests/` появляется исполняемый тест, не попадающий в
  обнаруживаемый шаблон (например, `rozetka-native.ts`)
- **THEN** он либо включён в отдельный явно настроенный запуск, либо его ручной
  порядок выполнения задокументирован в `docs/TESTING.md`

### Requirement: All existing suites run in CI or have a documented run order

Наборы, не запускаемые в CI сегодня, SHALL быть либо включены в CI, либо иметь
явный задокументированный порядок выполнения с обоснованием изоляции:

- `registration-email.test.cjs` (мок SMTP, безопасен) — запуск в CI;
- Jest-набор `npm run test:integration:http` — запуск в CI с одноразовой базой;
- `tests/rozetka-native.ts` — запуск в CI с одноразовой базой `_import_test`
  либо задокументированный ручной порядок.

#### Scenario: Email test runs in CI
- **WHEN** workflow `Verify storefront and backend` завершает backend-шаги
- **THEN** `registration-email.test.cjs` исполнен, и его результат учтён в статусе job

#### Scenario: Jest HTTP suite runs in CI
- **WHEN** workflow выполняет backend-проверки
- **THEN** шаг `npm run test:integration:http` запущен против изолированной базы,
  и его неуспех помечает job ошибкой

### Requirement: Run results are published in a machine-readable form

Каждый тестовый шаг CI SHALL выпускать отчёт формата JUnit (или иной
машиночитаемый) и загружать его артефактом сборки под уникальным именем прогона,
со сроком хранения не более 14 дней и без секретов в содержимом.

#### Scenario: Report artifact is available
- **WHEN** прогон workflow завершён
- **THEN** в артефактах доступны отчёты с именами тестов, статусами и длительностью

#### Scenario: Failures are diagnosed from the report
- **WHEN** тест в CI падает
- **THEN** в отчёте указаны набор, имя упавшего теста и причина, достаточные
  для диагностики без повторного прогона вслепую
