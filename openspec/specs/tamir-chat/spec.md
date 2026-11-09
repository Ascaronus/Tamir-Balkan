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


#### Scenario: Send from the message composer

- WHEN Enter is pressed in the message field
- THEN the same form submission as the Send button runs without adding a newline
- WHEN Shift+Enter is pressed or an IME composition is being confirmed
- THEN typing continues without sending
- Empty drafts, held-key repeats and attempts during an in-flight send SHALL NOT submit another message


### Requirement: Automatic messages follow the active locale
Automatic messages MUST use the chat bubble presentation and resolve SR/EN text using template identity at render time.

#### Scenario: Switch locale after a greeting or delivery acknowledgement
- GIVEN an automatic greeting, returning, offline, acknowledgement or status message is visible
- WHEN the shopper changes SR to EN or EN to SR
- THEN the configured text changes without translating it through Google or re-sending it to Telegram

### Requirement: Private image attachments
Shoppers MAY send one static JPEG, PNG or WebP image per message, with optional text. The server MUST decode and re-encode uploads, reject invalid/animated/oversized input, strip metadata and enforce ownership and rate limits.

#### Scenario: Image-only submission and replay
- WHEN a shopper sends an image up to 5 MiB and 20 megapixels
- THEN a normalized private JPEG, message and delivery task are persisted atomically
- AND replaying the client ID creates no duplicate
- AND Telegram receives the photo in the matching conversation topic without invoking text translation for the image

#### Scenario: Isolation and deletion
- WHEN another account or a logged-out visitor requests an attachment
- THEN access is denied even if the image and conversation IDs are known
- AND deleting or expiring the conversation deletes its stored images

#### Scenario: Mobile composer
- WHEN the chat is opened on a 320px-wide viewport
- THEN status, attachment controls, textarea and send button have separate space without horizontal overflow
