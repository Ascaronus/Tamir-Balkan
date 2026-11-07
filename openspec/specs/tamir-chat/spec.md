# TAMIR Chat

## Purpose

Customer support in the storefront and existing Medusa Admin, bridged to Telegram with server translation.

## Requirements

### Requirement: Isolate customer and guest history

The server SHALL derive customer identity from Medusa authentication and verify ownership on every read/mutation. Guest proofs SHALL be random, hashed in storage and expiring. Explicit claims SHALL require both identities and revoke old guest access atomically.

#### Scenario: Stale guest request after claim

- GIVEN a customer claims a guest conversation
- WHEN the old guest proof requests or changes that conversation
- THEN access is rejected, including requests whose preliminary check preceded the claim

### Requirement: Durable delivery

The system SHALL persist message and outbox atomically, deduplicate client UUIDs and Telegram updates, retain original text, and retry failures. Unconfirmed operator translation SHALL remain hidden. External Telegram sends SHALL be documented as at least once.

#### Scenario: Translation unavailable

- WHEN Google translation fails
- THEN the original remains stored, a safe error is recorded, retry is scheduled and no unconfirmed operator text is delivered

### Requirement: Authenticate Telegram replies

Every webhook SHALL pass secret, group, thread/reply reference and enabled operator role checks. Unknown operators, bots and forwarded/channel messages SHALL NOT send replies to customers.

### Requirement: Native administrative control

Eight native Medusa Admin sections SHALL provide real settings, checks, templates, operators, dialogs and statistics. PostgreSQL SHALL persist configuration with revision conflict checks. Encrypted provider secrets SHALL be write-only; viewer/operator/manager permissions SHALL be checked server-side.

### Requirement: Localized and recoverable widget

SR/EN SHALL cover labels and configurable templates. Account users SHALL bypass guest form; guest email/phone SHALL be independently optional. SSE SHALL reconnect and replay more than one page without duplicated IDs. Logout SHALL unmount private state. Product context SHALL use actual selection and server validation.

### Requirement: Honest status and retention

Availability SHALL require an enabled operator explicitly marked available, not bot connectivity. Delivered SHALL NOT mean read. The widget SHALL disclose Telegram/Google processing and retention. System templates SHALL NOT enqueue recursive external delivery. Deletion/retention SHALL cascade through chat storage; external copies require separate handling.
