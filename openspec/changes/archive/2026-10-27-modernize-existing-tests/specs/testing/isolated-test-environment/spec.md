# Spec Delta: isolated-test-environment

## ADDED Requirements

### Requirement: Tests use only disposable isolated resources

Все интеграционные тесты SHALL обращаться только к одноразовым ресурсам:
PostgreSQL-сервис CI (backend-job) с отдельной тестовой базой
(`TEST_REVIEWS_DB_URL`), временные схемы/базы вида `_import_test` для сценариев
импорта. Запуск против боевой базы или боевого стенда SHALL быть невозможен.

#### Scenario: Test database is separate from production
- **WHEN** интеграционный тест подключается к PostgreSQL
- **THEN** строка подключения указывает на тестовую базу CI-сервиса,
  а не на боевую БД проекта

#### Scenario: A repeated run does not inherit data
- **WHEN** один и тот же интеграционный набор запускается повторно
- **THEN** прогон не зависит от данных предыдущего прогона и даёт тот же результат

### Requirement: Guard barrier against the production environment

Тестовые обёртки и CI-шаги SHALL содержать проверку, отказывающую в запуске,
если строка подключения или целевой адрес указывают на боевое окружение
(боевой хост, боевая `DATABASE_URL`, боевые токены).

#### Scenario: Production connection string is rejected
- **WHEN** в тестовом запуске переменная БД указывает на известный боевой хост
- **THEN** тестовый прогон немедленно завершается ошибкой до первого запроса

### Requirement: Test run secrets are generated, not borrowed

CI и локальные тестовые прогоны SHALL использовать генерируемые одноразовые
значения `JWT_SECRET` и `COOKIE_SECRET` (длиной не менее 32 байт), а не боевые
секреты. Реальные внешние ключи (OpenAI, Rozetka, SMTP-пароли) в тестах
SHALL не использоваться; внешние зависимости подменяются или отключаются.

#### Scenario: Secret generation in CI
- **WHEN** backend-job workflow настраивает окружение
- **THEN** `JWT_SECRET` и `COOKIE_SECRET` сгенерированы случайно для прогона,
  и в логах тестов они не публикуются

#### Scenario: External keys are not required
- **WHEN** тестовый набор запускается без переменных `OPENAI_API_KEY`,
  `ROZETKA_API_KEY` или боевого SMTP
- **THEN** набор проходит, используя заглушки или пропуски с явной пометкой

### Requirement: Tests do not depend on execution order

Интеграционные тесты SHALL быть независимы по данным: каждый готовит свои данные
и убирает их, либо работает в изолированной схеме/базе. Совместный запуск
разных файлов SHALL давать результат, не зависящий от порядка.

#### Scenario: File order does not affect the result
- **WHEN** два порядка исполнения файлов `backend/tests/*.integration.cjs`
  дают разные результаты
- **THEN** это считается дефектом, и тесты дорабатываются до независимости
