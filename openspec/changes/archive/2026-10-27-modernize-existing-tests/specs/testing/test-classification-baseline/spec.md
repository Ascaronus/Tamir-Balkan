# Spec Delta: test-classification-baseline

## ADDED Requirements

### Requirement: Every existing test is classified by layer

Каждый тестовый файл каталогов `frontend/tests/`, `backend/tests/` и
`backend/integration-tests/` SHALL быть классифицирован как `unit`, `component`,
`db-integration`, `handler`, `http-integration` или `ui-e2e` с указанием границ
мокирования/изоляции. Результат SHALL быть сохранён в документации набора тестов.

#### Scenario: Test catalog with classification
- **WHEN** модернизация набора тестов начинается
- **THEN** существует таблица, где для каждого файла указаны слой, мокнутые/изолированные
  границы и что именно тест доказывает

#### Scenario: Misleading name is clarified
- **WHEN** тест с названием «integration» не обращается к реальным границам
  (например, использует фейковые `req/res`)
- **THEN** его классификация в каталоге уточнена, а имя либо исправлено, либо
  отмечено как историческое с пояснением

### Requirement: Baseline of runs and weak spots is collected before changing tests

До изменения каких-либо тестовых файлов SHALL быть собран baseline: длительности и
результаты текущих CI-прогонов, а также перечень вакуумных утверждений, чрезмерного
мокирования проверяемой логики и вводящих в заблуждение имён.

#### Scenario: CI snapshot before the changes
- **WHEN** работа по модернизации ещё не изменила тестовые файлы
- **THEN** зафиксированы длительности job и исходы последних прогонов
  `Verify storefront and backend`

#### Scenario: Weak checks are marked, not removed
- **WHEN** в существующем тесте обнаружено утверждение без содержательной проверки
- **THEN** оно отмечено в baseline с планом дополнения более высоким слоем,
  а не удалением теста

### Requirement: Guarantees and limitations of each layer are documented

Документация SHALL описывать, что доказывает каждый слой тестов и чего он доказать
не может: реальная доставка писем, работа платёжных систем, поведение настоящего
браузера и боевого развёртывания.

#### Scenario: Layer boundaries in the documentation
- **WHEN** читатель документации смотрит на описание слоя
- **THEN** для слоя указаны типы доказательств и явный список того,
  что проверки этого слоя не подтверждают
