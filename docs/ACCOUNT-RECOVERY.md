# Account recovery and guest checkout

## Registration after deletion

The verified registration route can reclaim a customer-only email/password identity
whose `customer_id` is null, points to a soft-deleted customer, or points to a
missing customer. Cleanup runs only after the registration code has been verified.
A live customer with this email or linked ID, another actor (including admin), or
an identity shared with an OAuth provider cannot be detached. Reclaimed legacy
upper-case email identifiers are normalized without merging unrelated identities.

## Password recovery

The login page links to `/rs/account/forgot-password`, available in Serbian and English.
The customer passes CAPTCHA and requests a six-digit code, then enters the code
and a new password twice. A prominent notice asks them to check spam.

- Code lifetime: 10 minutes; maximum 5 failed attempts; resend cooldown: 60 seconds.
- Resending invalidates the previous code. Successful reset consumes the code.
- Codes are stored as keyed hashes, not plaintext, separately from registration codes.
- The challenge is bound to the original customer, auth identity and password version.
- Only active registered customer accounts can be reset; guest/deleted/admin identities
  are not changed. The start endpoint uses the same public response for unknown emails.
- The existing SMTP configuration and Turnstile keys are used. The Turnstile action is
  `password_reset`; it must match server verification.
- Medusa's email/password provider hashes the new password. The user then signs in.

`setup-reviews.ts` now idempotently creates `tamir_password_reset`.
The existing deployment script already runs this setup before switching releases.
No manual SQL or new environment variables are required for the normal deployment.

## Guest checkout

Cart and checkout show an explicit “Buy without registration” option. The guest
enters contact and delivery information and places an order through the existing
Medusa cart/payment flow. Choosing login can return the customer to checkout.

SDK and UI now use the same JWT storage key. If the saved account has been deleted
or its token is rejected, both current and legacy tokens are cleared before cart
initialization. Transient backend errors do not clear a valid saved session.

Browser scenarios use an isolated API fixture and simulated CAPTCHA. They do not
send real emails or create production accounts/orders. PostgreSQL integration tests
cover identity reclamation and real Medusa password hashing/authentication.

## Responsive browser checks

63 page/viewport combinations were checked in Chromium: catalog, product, cart,
checkout, registration, login and password recovery at 1920×1080, 2560×1440,
320×568, 360×780, 375×667, 390×844, 412×915, 430×932 and 768×1024.
Mobile contexts emulate touch and device pixel density. These are browser
emulations, not tests on physical phones or Safari/WebKit. No horizontal overflow,
broken images or page runtime errors were observed in this matrix.
