# Tasks: Header Auth UX and Login Modal (TB-13)

## Closure Decision (2026-11-16)

Решением владельца от 16.11.2026 по TB-13 от ассистента принимается **только документация**:
дельта-спека этого change синхронизирована в основную спеку `openspec/specs/customer-auth/spec.md`,
документация обновена, change закрыт. Прогоны тестов, работа на стенде, правки Figma-макетов и
чек-листы приёмки **вне объёма** этого закрытия — их выполняет команда разработки и QA отдельно.
Поэтому пункты групп 2–4 ниже помечены как **СНЯТ** и остаются с незакрытым чекбоксом как запись о
том, что проверки не выполнялись. Архивация change выполнена перемещением каталога в
`openspec/changes/archive/2026-11-16-header-auth-ux-login-modal`: команда `openspec archive`
отказывается выполнить слияние, потому что требования дельты уже присутствуют в основной спеке.
Комментарии в YouTrack TB-13 не публикуются (решение владельца от 16.11.2026).

## 1. Figma Mockup (before implementation — required)

- [x] 1.1 Обновить Figma-макет TAMIR (экран «Пользовательские сценарии и авторизация», прототип figma.com/prototype/111576374988653): нарисовать header-кнопку гостя «Prijavi se» / «Sign in», header авторизованного (имя + выпадающее меню «Moj nalog» / «Moje porudžbine» / «Odjavi se»), модалку входа (440 px, email/password, «Zaboravili ste lozinku?», «Prijavi se» + «Registruj se» одинаковой ширины) для sr и en; зафиксировать ссылку на обновлённый макет в комментарии YouTrack TB-13 и в описании PR. **Сверка макета выполнена 2026‑11‑16** (файл `2u9V1x7faa2yieZqRP0KaF`, страница `79:1215`, фрейм `202:3521`): состояние соответствует спецификации и текущему коду (`HeaderAccount.tsx`, `LoginDialog.tsx`) — перерисовка не требовалась. Ссылка в YouTrack TB‑13 **не публикуется по решению владельца от 16.11.2026**; ссылка в описании PR — при создании PR.

## 2. Implementation Review Against the Specification (closing gaps)

- [ ] 2.1 **[СНЯТ 16.11.2026 — см. Closure Decision]** Пройти delta-спеку `specs/customer-auth/spec.md` по текущему коду (`HeaderAccount.tsx`, `LoginDialog.tsx`, `LoginForm.tsx`, `AuthProvider.tsx`, `globals.css`) и зафиксировать чек-лист соответствия (большинство требований уже реализовано — только подтвердить, не переписывать).
- [ ] 2.2 **[СНЯТ 16.11.2026 — см. Closure Decision]** Мобильная панель `UserNav.tsx`: привести подписи входа/регистрации к таблице ТЗ (`auth.login.*`: «Prijavi se» / «Registruj se»), проверить переходы на локализованные маршруты; page-based поведение панели не менять (design.md Decision 5).
- [ ] 2.3 **[СНЯТ 16.11.2026 — см. Closure Decision]** Проверить усечение длинного имени в шапке и неизменность высоты header (`header-account-name`, max-width 140px) на sr/en и mobile; при расхождении — точечная CSS-правка.
- [ ] 2.4 **[СНЯТ 16.11.2026 — см. Closure Decision]** Подтвердить, что модалка при ошибочных учётных данных остаётся открытой, email сохраняется, сообщение локализовано без технических деталей (при расхождении — минимальная правка `LoginForm.tsx`).

## 3. Tests (per docs/TESTING-RULES.md)

- [ ] 3.1 **[СНЯТ 16.11.2026 — см. Closure Decision]** Расширить `frontend/tests/header-authentication.test.mjs` (без ослабления существующих проверок — §4): сценарий «отправка без навигации/смены URL», состояние загрузки кнопки, сценарий ошибочных учётных данных (модалка открыта, email сохранён), полный набор sr/en текстов по таблице ТЗ (`auth.login.*`, `headerAuth.*`).
- [ ] 3.2 **[СНЯТ 16.11.2026 — см. Closure Decision]** Интеграционная проверка маршрутов через `frontend/test-support/verify-localized-routes.mjs`: подтвердить покрытие `/rs/nalog/prijava|registracija|zaboravljena-lozinka`, `/en/account/login|register|forgot-password`, редиректов `/rs/account/* → /rs/nalog/*`; дополнить только при пробеле.
- [ ] 3.3 **[СНЯТ 16.11.2026 — см. Closure Decision]** Ручной UI-чек-лист (§6): `/en` и `/rs` (тексты, маршруты), клавиатура (Tab/Escape, ловушка фокуса, возврат фокуса), медленная сеть (pending-кнопка), mobile viewport модалки; в PR — скриншоты sr/en.

## 4. Finish

- [ ] 4.1 **[СНЯТ 16.11.2026 — см. Closure Decision]** В `frontend/`: `npm run lint`, `npm test`, `npm run build` — зелёные (Testing DoD, TESTING-RULES §7); коммиты с `[TB-13]`.
- [ ] 4.2 **[СНЯТ 16.11.2026 — см. Closure Decision]** PR: описание по шаблону PRD, link на YouTrack TB-13, ссылка на обновлённый Figma-макет, скриншоты sr/en, чек-лист соответствия delta-спеке.
