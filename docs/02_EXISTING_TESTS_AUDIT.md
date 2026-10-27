# TAMIR.RS — Existing Test Suite Audit and Coverage Improvement Plan

**Version:** 2.0 · **Date:** 26 October 2026  
**Source:** Actual files in `Ascaronus/Tamir-Balkan` on the `main` branch, inspected via GitHub.  
**Status:** Audit and implementation specification. **No code was changed and no tests were executed during this review.**

> **Key conclusion:** Mocking is **not inherently wrong**. Mocks are useful for isolating business logic, controlled failures, and fast feedback. The risk is treating mocked tests as proof that live HTTP, SMTP, browser, database, and complete user flows work. Preserve valuable tests and add independent tests across real integration boundaries.

## Mandatory AI agent execution policy — strictly sequential (single-threaded)

> **Subagents: Don't dispatch all at once. One subagent must finish its job before the next one can be dispatched.**

This rule is **mandatory for every AI-driven implementation, audit, remediation and verification task described in this document**, including work performed by Codex, Claude Code, orchestrators or local LLM agents.

- **Maximum concurrent subagents: 1.** Dispatch exactly one subagent for one bounded task. **Do not** fan out, batch-dispatch, spawn background subagents or run multiple subagents in parallel.
- **Wait for completion.** The coordinator must wait until the current subagent has **fully finished**, returned its findings/artifacts, and exited before dispatching another subagent.
- **Review the handoff.** After each subagent, inspect its output, file changes, test evidence and unresolved issues; record the result and next task before proceeding.
- **One active writer.** Never allow two agents to modify the same repository/worktree simultaneously. Use sequential, reviewed commits or checkpoints; preserve earlier changes.
- **Failure handling is sequential.** If a subagent fails, times out or leaves incomplete work, resolve or explicitly record that state before starting another. Never work around a slow agent by launching a second one.
- **No implicit delegation.** A subagent must not spawn further subagents or background AI tasks unless the coordinator explicitly authorizes a sequential handoff under this same one-at-a-time policy.
- **Applies across both TAMIR repositories.** If work spans `Tamir-Balkan` and `Tamir-QA-Automation`, complete and verify one agent's task in one repository before the next agent's task begins in either repository.
- **Coordinator workflow:** `plan -> dispatch one subagent -> await completion -> review and verify -> record handoff -> dispatch the next subagent`.

**Scope:** This controls **AI agent orchestration**, not normal CI test execution. GitHub Actions may use ordinary parallel test workers where safe and configured; the **AI agents themselves must work in a single sequential stream**.

## 1. Current baseline

- `frontend/tests/*.test.mjs`: Node `node:test` tests for React/Next.js application logic, using a custom component harness and dependency substitutions.
- `frontend/test-support/`: TypeScript/TSX loaders, component harness, and localized route checks.
- `backend/tests/*.test.cjs`: Node tests covering units, route handlers, and orchestration.
- `backend/tests/*.integration.cjs`: some tests connect to **isolated PostgreSQL** using `TEST_REVIEWS_DB_URL`, while external services and selected Medusa modules may still be mocked.
- `backend/integration-tests/http/health.spec.ts`: Medusa integration runner makes a request to `/health`.
- `.github/workflows/verify.yml`: GitHub Actions with Node `20.20.2` and `24`, PostgreSQL 16, frontend tests/lint/build/route checks, backend tests/build, and deployment-script validations.
- `docs/TESTING.md`: project testing instructions and environment restrictions; explicitly warns that fixture-based checks do **not** prove real email delivery or payment processing.

**Not verified:** full browser Playwright/Cypress E2E, a deployed storefront+backend black-box test flow, real email reaching a test mailbox, a complete Allure pipeline. Absence from the reviewed sources is not proof that no other branch or environment contains it.

## 2. File-level classification and limitations

| File | Actual scope | Mocked/isolated boundaries | Appropriate classification | Does NOT establish |
|---|---|---|---|---|
| `frontend/tests/cart-client.test.mjs` | Add/change/remove cart items, concurrent cart creation, inventory failures | Medusa SDK, HTTP/fetch, storage, region functions | Unit/service tests with mocked dependencies | Browser and real API cart behavior |
| `frontend/tests/catalog-ui.test.mjs` | Filters, URL arguments, localized color swatches, request parameters | API client returns prepared responses | Unit/module interaction | Live product data, prices, inventory |
| `frontend/tests/registration-code-ui.test.mjs` | Signup state transitions, OTP flow ordering, preventing login before verification | React hooks/harness, CAPTCHA, auth API, router | Component logic | Email delivery, live CAPTCHA, browser signup |
| `frontend/tests/seo.test.mjs` | Sitemap, robots, canonical URLs, metadata | Selected route dependencies and fixture data | Unit/route metadata | Actual served HTML/HTTP SEO behavior |
| `backend/tests/catalog-http.test.cjs` | Real middleware + route handler, pagination, sorting, scope rules | Fake `req/res`, dependency container, graph/services | Mock-backed API-handler test | Network HTTP or Medusa/DB integration |
| `backend/tests/rozetka-admin.test.cjs` | XML parsing, import validation and workflow orchestration | Medusa workflow functions, some external operations | Unit/orchestration contract | Actual persisted products, variants and inventory |
| `backend/tests/registration-email.test.cjs` | SMTP configuration, message formatting, subscriber calls/failures | `nodemailer.createTransport` replaced | Unit/service with SMTP mock | SMTP connection, delivered message, TLS/credentials |
| `backend/tests/registration-code.integration.cjs` | OTP expiry, hashing, concurrency, retries | **Real PostgreSQL**; outbound email callback is simulated | DB integration | Real mailbox, complete signup HTTP path |
| `backend/tests/login-rate-limit.integration.cjs` | Login throttling with PostgreSQL-backed state | Real PostgreSQL; fake HTTP requests/responses/logger | DB + middleware integration | Entire live Nginx/HTTP path |
| `backend/tests/reviews.integration.cjs` | Review handlers plus real PostgreSQL schema | Turnstile via patched `global.fetch`; selected Medusa dependencies | DB/handler integration | Live third-party Turnstile and browser journey |
| `backend/integration-tests/http/health.spec.ts` | `/health` request under Medusa integration runner | Test runner environment | HTTP integration smoke | Full shop, DB, mail or checkout readiness |

**Caveat:** This is a source-reading classification, not runtime verification. Other files (`catalog-popularity`, `product-urls`, `password-reset`, `category-localization`, etc.) need individual review before categorical conclusions.

## 3. When mocks are appropriate and when they become risky

**Good use cases:** deterministic sorting/validation tests, extreme edge cases, injected network failure, verifying calls across module boundaries, and fast PR feedback.

**Risk indicators:** mocking the same core behavior being asserted, always-successful fake responses that conceal schema/authorization problems, tests asserting only invocation counts, green CI despite nonfunctional services, or describing mocked handlers as browser E2E.

**Rule:** Do **not** ban or mass-delete mocks. Label each test precisely; cover each critical external boundary with at least one separately executed non-mocked integration/black-box check.

## 4. Target coverage matrix

| Business process | Existing evidence | Required complement | Execution target |
|---|---|---|---|
| Catalog/search/filters | Unit/handler fixtures | Real HTTP contract + browser E2E against seeded products/prices | Ephemeral CI |
| Cart/inventory | Fake Medusa SDK tests | Real Medusa cart create/update/delete; browser journey | Ephemeral CI |
| Registration/OTP | DB integration + simulated UI/email | HTTP signup → Mailpit email → retrieve OTP → confirm → authenticate | Ephemeral CI + Mailpit |
| Email notices | Mock Nodemailer | Real application SMTP delivery to test Mailpit inbox and content assertion | Ephemeral CI |
| Rozetka XML import | Parser + mocked Medusa workflows | Real Medusa import and persisted variants, stock, translations checked through API/DB | Ephemeral CI |
| Serbian/English localization | Routing/translation unit tests | Browser E2E, actual HTTP responses, locale persistence | Ephemeral CI |
| SEO | Metadata unit + route verification | GET `/robots.txt`, `/sitemap.xml`, served HTML canonical/hreflang | Ephemeral CI |
| Login throttling | DB middleware integration | Real HTTP rate-limit negatives and proxy-header trust behavior | Ephemeral CI |
| Reviews/CAPTCHA | PostgreSQL + mocked Turnstile | Live app HTTP journey; third-party CAPTCHA test mode or isolated boundary stub | Ephemeral CI |
| Order scenario | Module behavior | Cart → address → shipping → supported non-payment test flow | Ephemeral CI |

**Payments are not connected.** Do not claim successful card payments or completed paid-checkout E2E.

## 5. Testing layers and repository responsibilities

1. Keep fast **unit/component tests** in `Tamir-Balkan`; they prove localized logic and state transitions.
2. Retain and improve **PostgreSQL integrations**: real SQL constraints/transactions, schema setup and cleanup in an isolated DB.
3. Add **real API tests** in `Tamir-QA-Automation`: Python `pytest` + `httpx`, running backend, seeded fixtures.
4. Add **browser E2E**: Python Playwright, real Next.js pages, real backend; do not mock the application's critical API.
5. Replace external providers only at **intentional external boundaries** (for example actual public SMTP and third-party CAPTCHA), while allowing the real app to connect to Mailpit for test email.
6. Capture test evidence with **Allure**: **Russian titles, steps and human-readable diagnostics**, HTTP statuses, redacted response excerpts, screenshots/traces on failure, and run history. Test data and assertions must cover **English (`en`) and Serbian (`sr`) locales**.

## 6. Isolated CI environment

```text
GitHub Actions (Tamir-QA-Automation)
  ├── checkout pinned Tamir-Balkan SHA
  ├── PostgreSQL 16 — disposable test database
  ├── Redis — disposable test instance
  ├── Mailpit — test SMTP and inbox API
  ├── Medusa.js backend
  ├── Next.js frontend
  ├── Python pytest + httpx + Playwright
  └── Allure results → restricted CI artifacts → safe Russian GitHub Pages dashboard
```

- Pin app SHA and schema version for every run; perform readiness checks rather than only process checks.
- Never use production `DATABASE_URL`, Redis, SMTP, customer accounts or administrative credentials.
- On production, at most explicitly enabled **read-only smoke**; never registration, orders, email sending or imports.
- Seed test products, variants, stock, customers and locales; tear down disposable infrastructure after each run.
- Public Pages must contain **sanitized aggregate data only**; raw traces and request payloads remain restricted.

## 7. Target layout

```text
Tamir-Balkan/
  frontend/tests/               # unit/component/logic
  backend/tests/                # units and DB integrations
  backend/integration-tests/    # Medusa integration smoke
  .github/workflows/verify.yml

Tamir-QA-Automation/
  tests/api/
  tests/ui/
  tests/flows/
  pages/                       # Page Objects
  clients/                     # HTTP clients
  fixtures/
  testdata/                    # en / sr fixtures
  infrastructure/              # ephemeral environment + Mailpit + seed
  docs/
  .github/workflows/
  conftest.py
  pyproject.toml
  README.md
```

All generated results and traces must be excluded from Git history.

## 8. Localization and language contract (mandatory)

**Engineering documentation and files in these repositories must be in English.** This includes README, ADRs, technical specifications, code comments, CI workflow names, Python code and function names, module paths, identifiers, repository structure, and Git commit messages.

**User-facing QA reporting must be in Russian wherever technically feasible:** custom GitHub Pages dashboard, metric labels, summary, navigation, error explanations, release notes for test results, alert templates, manual review notes, test case display titles and Allure step descriptions. Standard GitHub Actions interface and native Allure chrome may remain in English where not natively localizable; do not falsely advertise a fully translated Allure UI.

**Application tests must cover both English and Serbian**, not Russian storefront translations: `en`/`sr` UI strings, routes, forms, errors, email messages, locale switching and persistence. Use readable Unicode text in fixtures and assertions, including Serbian Latin or Cyrillic where required by actual product behavior. Never translate expected actual storefront copy into Russian for assertions.

Recommended Python example:

```python
import allure
import pytest

@pytest.mark.parametrize("locale,expected_label", [
    ("en", "Continue shopping"),
    ("sr", "Nastavi kupovinu"),
])
@allure.title("Корзина: корректный текст кнопки для {locale}")
def test_continue_shopping_button(page, locale, expected_label):
    # Illustrative placeholder: actual selector/URL must be verified.
    ...
```

Keep screenshots of the actual English/Serbian storefront; explain failures in Russian. Localization display must not alter test semantics or API contracts.

## 9. Phased implementation plan

### P0 — classification and baseline
- [ ] Classify each existing test as `unit`, `component`, `db-integration`, `handler`, `http-integration`, or `ui-e2e`.
- [ ] Collect actual CI durations, outcomes and flaky rate before changing test files.
- [ ] Flag vacuous assertions, over-mocked core logic and misleading test names.
- [ ] Document **what each layer proves and what it cannot guarantee**.

### P1 — isolated runtime
- [ ] Boot Medusa + Next.js + PostgreSQL + Redis + Mailpit reproducibly in CI.
- [ ] Implement deterministic seed and readiness checks.
- [ ] Reject unsafe production hosts, tokens and DB connection strings.

### P2 — realistic critical scenarios
- [ ] Live catalog/cart API + negative cases.
- [ ] Signup/verification using OTP retrieved from Mailpit; expired/invalid OTP.
- [ ] Rozetka test XML import → verify persisted products, variants and inventory.
- [ ] Browser E2E of Serbian/English locales, cart and registration.

### P3 — CI reports and diagnostics
- [ ] Allure with Russian-facing test titles/steps, safe attachments and failure screenshots/traces.
- [ ] Upload diagnostic artifacts even on failed tests via `always()`.
- [ ] Russian-language Pages dashboard with sanitized cross-run history.
- [ ] Retention rules, provenance (`app_sha`, `qa_sha`), flaky classification and access control.

### P4 — acceptance criteria
- [ ] Full clean GitHub Actions execution on disposable infrastructure.
- [ ] Controlled real-app defect is detected by API/UI checks even when mocked unit test remains green.
- [ ] Real app SMTP → Mailpit test inbox verified without external mail.
- [ ] A failing case provides an Allure artifact and safe diagnostics.
- [ ] No production data altered; ephemeral data destroyed.
- [ ] Existing useful unit/integration tests remain intact.
- [ ] Dashboard/report labels are Russian, while storefront checks assert real `en`/`sr` content.

## 10. Rules for implementers and AI agents

1. Never mass-delete mocked tests. First map their intent and existing coverage.
2. For each change show: original test → missing guarantee → added higher-layer test → observed result.
3. Do not produce fake-green E2E tests or substitute mocked Medusa endpoints for purported live API checks.
4. Destructive tests require explicit proof of an ephemeral DB and approved target environment.
5. Mock third-party boundaries deliberately; use a real Mailpit SMTP connection in app-to-mail test scenarios.
6. Distinguish **source-code observations**, **executed test evidence**, and **planned future architecture**.
7. Submit reversible PRs and provide a concise Russian-language report of test outcomes and changes.
8. Keep all technical documentation/source code in English, use Russian for human-facing reporting, and test the storefront in English and Serbian.

## 11. Inspected source files

- https://github.com/Ascaronus/Tamir-Balkan/blob/main/docs/TESTING.md
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/.github/workflows/verify.yml
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/frontend/tests/cart-client.test.mjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/frontend/tests/catalog-ui.test.mjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/frontend/tests/registration-code-ui.test.mjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/frontend/tests/seo.test.mjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/tests/catalog-http.test.cjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/tests/rozetka-admin.test.cjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/tests/registration-email.test.cjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/tests/registration-code.integration.cjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/tests/login-rate-limit.integration.cjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/tests/reviews.integration.cjs
- https://github.com/Ascaronus/Tamir-Balkan/blob/main/backend/integration-tests/http/health.spec.ts

**Bottom line:** the problem is not mocked tests per se; it is missing independently verified production-like behavior at important boundaries. Preserve fast tests and add isolated real HTTP/UI/SMTP/DB coverage.
