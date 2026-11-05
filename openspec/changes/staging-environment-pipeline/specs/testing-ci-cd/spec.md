# Spec Delta: testing-ci-cd

## MODIFIED Requirements

### Requirement: Защитные проверки CI целостности выпуска
Verify обязан (MUST) после тестов выполнить `node test-support/verify-deploy-dispatch.mjs` (ручной
запуск прод-Deploy разрешён только из `refs/heads/main`, job обязан стоять за окружением
`production`), `bash -n scripts/deploy-vps.sh` (синтаксис), `node test-support/verify-deploy-pin.mjs`
(пиннинг SHA в прод-workflow и скрипте), `node test-support/verify-deploy-staging.mjs` (staging-контур:
у `deploy-staging.yml` нет триггеров `pull_request`/`push`, есть обязательный `sha` и environment
`staging`, job `deploy` ждёт job `gate`, а `scripts/deploy-staging.sh` требует ancestry-гейт по
`origin/main`) и `node test-support/verify-perimeter-bind.mjs` (прод-старты биндятся только на
loopback, контроль аудита HIGH-1), иначе job обязан (MUST) упасть.

#### Scenario: Ослабление guard'а в diff
- **WHEN** pull request меняет `deploy.yml` так, что `workflow_dispatch` больше не ограничен `main`,
  или снимает environment
- **THEN** `verify-deploy-dispatch.mjs` падает с assert-ошибкой, и job `verify` завершается неуспешно

#### Scenario: У staging-workflow появился push-триггер
- **WHEN** pull request добавляет в `.github/workflows/deploy-staging.yml` триггер `push` или
  `pull_request`, либо снимает `needs: gate` с job `deploy`
- **THEN** `verify-deploy-staging.mjs` падает с assert-ошибкой, и job `verify` завершается неуспешно

#### Scenario: Синтаксическая ошибка в shell-скрипте
- **WHEN** в pull request испорчен синтаксис любого `scripts/*.sh` или `scripts/lib/*.sh`
- **THEN** шаг `bash -n` завершается неуспешно, и ни один deploy не стартует

### Requirement: Гейтинг запуска Deploy
Прод-Deploy обязан (MUST) запускаться только вручную: `workflow_dispatch` с `refs/heads/main` и
обязательным вводом `sha`; автоматический запуск по `workflow_run` запрещён (MUST NOT). Job обязан
(MUST) использовать окружение `production` и единственную `concurrency`-группу
`tamir-production-deploy` без отмены промежуточных запусков. Автоматическим после `Verify storefront
and backend` на push в `main` обязан (MUST) быть только Deploy to Staging.

#### Scenario: Push в main не выпускает прод
- **WHEN** коммит слит в `main` и `Verify storefront and backend` на push завершился успешно
- **THEN** `Deploy TAMIR` не запускается, а запускается `Deploy to Staging`; прод ожидает ручного
  запуска

#### Scenario: Dispatch не из main
- **WHEN** `Deploy TAMIR` запущен через `workflow_dispatch` из ветки, отличной от `main`
- **THEN** job `deploy` не выполняется (условие `github.ref == 'refs/heads/main'`)

#### Scenario: Параллельные выпуски
- **WHEN** второй запуск Deploy стартует, когда первый ещё выполняется
- **THEN** второй ждёт освобождения группы `tamir-production-deploy` и не перекрывает живой релиз

### Requirement: Публикация ровно проверенного коммита
Прод-Deploy обязан (MUST) взять `VERIFIED_SHA` из обязательного ввода `sha` (`github.event.inputs.sha`)
и отказать при несоответствии формата `^[0-9a-f]{40}$`. Перед подключением к VPS workflow обязан
(MUST) проверить тот SHA через GitHub API: `compare main...sha` обязан вернуть статус `behind` или
`identical`, а все завершённые прогоны verify-workflow на этом SHA в `main` (события `push` или
`workflow_dispatch`) обязаны иметь conclusion `success`, `neutral` или `skipped`. Читать
`check-suites` гейт не обязан (SHOULD NOT): в них попадают прогоны других workflow того же SHA.
После проверки SHA обязан (MUST) быть передан удалённой команде `deploy` по
SSH с усиленными опциями (`BatchMode`, `IdentitiesOnly`, `StrictHostKeyChecking=yes`,
`HostKeyAlias=tamir-vps`, `UserKnownHostsFile` из секрета `VPS_KNOWN_HOSTS`, ключ во временном
каталоге с `umask 077`).

#### Scenario: Пустой SHA в контексте события
- **WHEN** в контексте запуска нет 40-символьного hex-SHA (обязательный ввод `sha` не заполнен)
- **THEN** workflow не создаётся (поле обязательное), а step завершается ошибкой «Refusing to
  deploy», и на сервер ничего не отправляется

#### Scenario: SHA неверного формата
- **WHEN** значение `sha` не проходит `^[0-9a-f]{40}$`
- **THEN** step «Confirm the commit passed Verify on main» завершается ошибкой, SSH-шаг не выполняется

#### Scenario: Коммит вне истории main
- **WHEN** введён SHA, для которого `compare main...sha` возвращает `ahead` или `diverged`
- **THEN** step «Confirm the commit passed Verify on main» завершается ошибкой, SSH-шаг не выполняется

#### Scenario: Неполный набор проверок на коммите
- **WHEN** хотя бы один check-suite целевого коммита не имеет статуса `completed` или имеет
  conclusion `failure`
- **THEN** step «Confirm the commit passed Verify on main» завершается ошибкой, SSH-шаг не выполняется

## ADDED Requirements

### Requirement: Автовыйпуск проверенного коммита на staging
После успешного `Verify storefront and backend` на push в `main` обязан (MUST) запускаться workflow
`Deploy to Staging` (`.github/workflows/deploy-staging.yml`) с тем же `head_sha`. Он обязан (MUST)
состоять из job `gate` на GitHub-hosted раннере и job `deploy` с `needs: gate` на self-hosted
раннере машины staging. Триггеры `pull_request` и `push` у этого workflow запрещены (MUST NOT).

#### Scenario: Merge в main поднимает стенд
- **WHEN** pull request слит в `main` и Verify на push завершился успешно
- **THEN** `Deploy to Staging` запускается автоматически и разворачивает именно `head_sha` этого
  Verify; job `gate` имеет права `contents: read` и `checks: read`, а job `deploy` стоит за
  `environment: staging`, единственной `concurrency`-группой и заданным `timeout-minutes`

#### Scenario: Падение Verify не даёт деплоя
- **WHEN** `Verify storefront and backend` на push в `main` завершился неуспешно
- **THEN** `Deploy to Staging` не запускается, стенд остаётся на предыдущем релизе

#### Scenario: Docs-only push в main
- **WHEN** в `main` слит push, в котором менялись только `docs/**`, `openspec/**` или `**.md`
- **THEN** Verify не запускается и автоматический staging-деплой тоже не запускается; для выпуска
  такого коммита на стенд используется ручной `workflow_dispatch` с этим SHA

### Requirement: Ручной запуск staging-деплоя по SHA
`Deploy to Staging` обязан (MUST) поддерживать `workflow_dispatch` с обязательным вводом `sha`
(40 hex) и обязан (MUST) выполнять тот же API-гейт происхождения коммита (`compare main...sha` ∈
{`behind`, `identical`}, прогоны verify-workflow в `main` — `completed` с conclusion
`success`/`neutral`/`skipped`), что и прод-Deploy. Job `deploy` обязан (MUST) вызывать `scripts/deploy-staging.sh <sha>` без
собственного `actions/checkout`.

#### Scenario: Возврат стенда на предыдущий коммит main
- **WHEN** оператор запускает `Deploy to Staging` вручную с SHA более старого коммита `main`
- **THEN** гейт пропускает такой SHA (статус `behind`), и стенд разворачивается на него

#### Scenario: SHA из ветки, не слитой в main
- **WHEN** оператор запускает staging-деплой вручную с SHA, которого нет в истории `main`
- **THEN** job `gate` завершается ошибкой и job `deploy` не запускается

### Requirement: Самопроверка происхождения коммита на машине
`scripts/deploy-staging.sh` обязан (MUST) принять ровно один аргумент — 40-hex SHA, получить
`origin/main` (с повторными попытками при сетевом отказе) и отказать в выпуске, если целевой коммит
не является предком `origin/main`. Работа обязана (MUST) вестись под non-blocking `flock`, а
исключение — только при явном `TAMIR_ALLOW_NON_MAIN=1` в окружении интерактивного запуска.

#### Scenario: Раннер получил чужой SHA
- **WHEN** в `deploy-staging.sh` передан SHA, отсутствующий в истории `origin/main`
- **THEN** скрипт прекращает работу до создания каталога релиза, живые процессы не тронуты

#### Scenario: Параллельные деплои на стенд
- **WHEN** второй запуск `deploy-staging.sh` стартует, когда блокировка ещё занята
- **THEN** второй процесс немедленно завершается сообщением о занятой блокировке
