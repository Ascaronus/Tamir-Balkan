# Verification, recovery and welcome email

Reviewed against the code on 2026-10-11. [Environment](ENVIRONMENT.md) · [Deployment](../DEPLOY.md).

Registration first sends a six-digit verification code synchronously; see [REGISTRATION.md](REGISTRATION.md). The account is created only after the correct code. The `customer.created` subscriber then sends a plain-text Serbian/English welcome email only for customers with `has_account=true`. Guest checkout customer records do not receive it. This is a registration notification, not verification of email ownership. Existing accounts are not emailed retroactively.

Set these values in the backend environment (`/root/tamir_balkan/backend/.env` on the VPS):

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_SMTP_ACCOUNT
SMTP_PASSWORD=YOUR_GOOGLE_APP_PASSWORD
```

Use a Google app password, not the normal account password. Enable two-step verification, then create an app password at https://myaccount.google.com/apppasswords . Never commit credentials. The sender is TAMIR with the SMTP account address; replies go to that account.

Deploy with `bash scripts/deploy-vps.sh`. From the active backend release directory (shown by `pm2 describe tamir-backend`), verify SMTP without sending an email:

```bash
npx medusa exec ./src/scripts/check-email.ts
```

Then register a new test customer through the storefront and check the inbox and spam folder. SMTP acceptance does not guarantee inbox delivery. No real email is sent by automated tests.

Verification and password-reset code delivery are synchronous: an SMTP failure prevents that send step and returns `CODE_SEND_FAILED` (503). The user cannot complete a new code flow without receiving a valid code.

The later welcome email is asynchronous. Its failure is surfaced in backend subscriber logs with sanitized messages and does not roll back an already created account. A successful delivery is marked in customer metadata; a row lock prevents concurrent duplicate deliveries. There is still an unavoidable ambiguity if the process crashes after SMTP accepts the message but before the marker commits. Event retries depend on the configured Medusa event bus; this does not add a durable email queue or promise retroactive delivery after an outage.

Do not change the review moderator account: email delivery configuration is independent of `admin@tamir.local`.
