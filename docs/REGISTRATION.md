# Registration with email verification

New customer registration is a two-step flow:

1. POST `/store/registration/start` with email and a valid `register` Turnstile token. The server sends a six-digit code through the configured SMTP account. It creates no customer or auth identity at this stage.
2. POST `/store/registration/verify` with the challenge ID, code, email and registration profile/password. Only a correct code allows the server to register the auth identity and run Medusa's customer-account creation workflow. The storefront then signs in with the supplied password.

The form prominently reminds customers to check Spam, supports one-time-code autofill/paste, and has EN/SR translations. Password and profile remain in React memory while awaiting the code, not in browser storage or the pending-code table. Reloading the page requires starting again.

## Limits and persistence

- Codes expire after 10 minutes and allow 5 wrong attempts. Failed attempts are committed even when the API returns an error. Parallel guesses serialize on the database row.
- Resend requires a fresh CAPTCHA and at least 60 seconds since the last successful send. A successful resend replaces both the challenge ID and code, resets the attempt counter, and invalidates the previous code. SMTP rejection rolls back the new code, retaining the previous one.
- Additional limits: 30 send requests per IP/hour, 5 per email/hour, 60 verification requests per IP/hour.
- Codes are generated with Node's cryptographic random generator and stored only as an HMAC using REVIEW_RATE_SECRET (or JWT_SECRET). The table is additive and created by `setup-reviews.ts` during deployment.
- Pending rows older than expiry + 24 hours are cleaned during successful sends.
- Repeating a successful confirmation is idempotent for that same challenge and password within its original expiry; it cannot create another customer or change credentials. This supports recovery after a lost HTTP response.

Both `/auth/customer/:provider/register` and POST `/store/customers` reject public requests with EMAIL_VERIFICATION_REQUIRED. Old unregistered JWTs cannot bypass code verification. Admin customer creation and existing customer login are unchanged. Guest checkout does not create a registered account.

## Deleted and existing accounts

After successful code verification, the exact Medusa 2.13.1 tombstone `{ "customer_id": null }` may be cleared when a deleted registered customer exists and no active account exists. Active customers and identities containing admin/custom actor metadata or other providers are never released. A deleted user registers as a new customer; old orders and addresses are not restored.

Existing active accounts are not reset by the code flow. They receive ACCOUNT_EXISTS and should use login/password recovery. Older active accounts are not forced through retroactive verification.

## Deployment and verification

Configure SMTP_USER and SMTP_PASSWORD (Gmail app password) in the source backend environment. `deploy-vps.sh` checks configuration, creates the code table, and verifies SMTP before activating the new release. No email is sent by the connectivity check. A successful SMTP check does not guarantee inbox delivery; check Spam too.

Run the PostgreSQL regression tests against an isolated test database:

```bash
TEST_REVIEWS_DB_URL=... node --test tests/registration-code.integration.cjs tests/deleted-customer-registration.integration.cjs
```

The test suite uses fake email delivery; no real email is sent. A live registration check is still necessary after deployment.
