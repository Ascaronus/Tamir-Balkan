# HTTP integration tests

Reviewed on 2026-10-11. This directory currently contains `health.spec.ts`: it uses `medusaIntegrationTestRunner` from `@medusajs/test-utils`, starts the application and checks that GET `/health` returns 200. It is a Jest test, distinct from the Node test suites in `backend/tests/`.

From `backend/`, with dependencies installed and a dedicated test database/configuration:

```bash
npm run test:integration:http
```

The package script sets `TEST_TYPE=integration:http`; `jest.config.js` selects these files. Do not point integration test setup at production data. A successful health test does not verify imports, email delivery, checkout or all business rules.

The main GitHub CI runs explicit frontend and `backend/tests/*.cjs` regressions plus builds; it does not use this single health test as their replacement. See [TESTING.md](../../../docs/TESTING.md) and [verify.yml](../../../.github/workflows/verify.yml).
