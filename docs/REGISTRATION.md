# Re-registering a deleted customer

Medusa 2.13.1's admin customer deletion soft-deletes the customer and sets the auth identity's `app_metadata.customer_id` to `null`. Emailpass rejects registration because that metadata object is still nonempty.

After registration rate limiting and CAPTCHA, the emailpass registration middleware clears only the exact `{ "customer_id": null }` metadata object, and only when there is a deleted registered customer with that email and no active registered customer. The update is conditional and atomic. Identities containing admin/custom actor metadata or another authentication provider are not changed. Accounts with no evidence of customer deletion are not changed.

The standard Medusa emailpass registration then sets the newly supplied password and creates a new customer profile through the normal storefront flow. This also handles customers deleted before this fix; no manual database cleanup is needed. It does not restore the deleted customer's orders, addresses or profile, and does not remove historical records. CAPTCHA remains mandatory.

Integration checks: `TEST_REVIEWS_DB_URL=... node --test tests/deleted-customer-registration.integration.cjs` from `backend/`, against an isolated test database. The test creates and removes its own schema. CI runs these checks on PostgreSQL 16.
