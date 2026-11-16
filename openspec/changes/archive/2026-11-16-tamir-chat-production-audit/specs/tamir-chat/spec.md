# TAMIR Chat — дельта-спецификация (production audit)

## MODIFIED Requirements

### Requirement: Isolate customer and guest history

The server SHALL derive customer identity from Medusa authentication and verify ownership on every read/mutation. Guest proofs SHALL be random, hashed in storage and expiring. Explicit claims SHALL require both identities and revoke old guest access atomically.

#### Scenario: Stale guest request after claim

- GIVEN a customer claims a guest conversation
- WHEN the old guest proof requests or changes that conversation
- THEN access is rejected, including requests whose preliminary check preceded the claim

#### Scenario: Guest conversation identity

- WHEN an anonymous shopper opens the chat
- THEN the server issues the HttpOnly, SameSite=Lax cookie `tb_chat_guest` with a random proof and a 30-day lifetime
- AND history is keyed by the SHA-256 hash of the proof, never by client-declared identity

#### Scenario: Cross-tenant history isolation

- WHEN a customer of another tenant or sales channel references conversation or message IDs that exist
- THEN the endpoints return 404 without exposing the resource
- AND customer conversation lists are filtered by customer, region and sales channel

#### Scenario: Bounded history pages

- WHEN the widget loads conversation history
- THEN it receives a newest-first bounded page with a resume cursor
- AND paging further never duplicates or skips messages at the page boundary

### Requirement: Durable delivery

The system SHALL persist message and outbox atomically, deduplicate client UUIDs and Telegram updates, retain original text, and retry failures. Unconfirmed operator translation SHALL remain hidden. External Telegram sends SHALL be documented as at least once.

#### Scenario: Translation unavailable

- WHEN Google translation fails
- THEN the original remains stored, a safe error is recorded, retry is scheduled and no unconfirmed operator text is delivered

#### Scenario: Message delivery lifecycle

- WHEN a shopper sends a message
- THEN the message and its outbox task are persisted in one transaction with status `sent`
- AND after Telegram acceptance the status becomes `delivered` and the Telegram message id is stored
- AND a terminal failure records status `error` with a safe error code while the original text is retained
- AND read state is tracked separately from delivery via `seen_at`, never as a message status

#### Scenario: Unconfirmed sends are retried

- WHEN a stored send has no Telegram message id
- THEN the delivery worker re-attempts it, deduplicating by Telegram update id so retries create no duplicate side effects
- AND automatic and operator messages retry with capped exponential backoff `min(1h, 5s * 2^attempts)` up to 8 attempts, after which the task is parked as failed

#### Scenario: Widget receives delivery state over SSE

- WHEN message, read, typing or attachment events are committed
- THEN they are published per conversation (PostgreSQL NOTIFY + polled outbox) and pushed over SSE within ~2 seconds
- AND a client whose stream is disabled or expired falls back to polling without losing messages

### Requirement: Authenticate Telegram replies

Every webhook SHALL pass secret, group, thread/reply reference and enabled operator role checks. Unknown operators, bots and forwarded/channel messages SHALL NOT send replies to customers.

#### Scenario: Webhook secret is generated and rotated

- WHEN an admin saves Telegram provider secrets
- THEN the server re-validates them with `getMe`, always stores a freshly generated webhook secret and re-registers the webhook in the same request

#### Scenario: Unsigned webhook delivery is rejected

- WHEN a webhook request lacks the `x-telegram-bot-api-secret-token` header or the value does not match
- THEN the server responds 401 with `CHAT_WEBHOOK_UNAUTHORIZED` and performs no processing
- AND the check is never skipped, including when no secret has been saved yet

#### Scenario: Reply reference must match the conversation topic

- WHEN a Telegram update does not match the expected chat id, forum topic or reply reference
- THEN it is routed to the reconcile queue instead of a conversation
- AND unknown operators, bots and forwarded or channel messages never produce customer-visible replies

### Requirement: Native administrative control

Eight native Medusa Admin sections SHALL provide real settings, checks, templates, operators, dialogs and statistics. PostgreSQL SHALL persist configuration with revision conflict checks. Encrypted provider secrets SHALL be write-only; viewer/operator/manager permissions SHALL be checked server-side.

#### Scenario: Eight admin sections

- WHEN an operator with sufficient capabilities opens the TAMIR Chat plugin UI
- THEN the sections Обзор, Провайдеры, Топики, Шаблоны, Авто сообщения, Операторы, Диалоги and История are all present and functional against real data

#### Scenario: Configuration revision conflict

- WHEN an admin form is saved with a stale settings revision
- THEN the server rejects it with 409 and `CHAT_SETTINGS_CHANGED`
- AND the admin UI reloads the latest revision instead of overwriting it

#### Scenario: Provider secrets encrypted at rest

- WHEN Telegram credentials are saved
- THEN they are stored AES-256-GCM-encrypted with `CHAT_ENCRYPTION_KEY` (64 hex characters, required)
- AND without a valid key the server returns 503 with `CHAT_ENCRYPTION_KEY_REQUIRED` and never stores plaintext secrets
- AND admin reads expose only masked placeholders

#### Scenario: Administrative actions are permission-checked

- WHEN an admin calls chat management endpoints (settings, dialogs, operator replies, attachment viewing, conversation deletion)
- THEN server-side policy checks on chat capabilities run for every action
- AND insufficient permissions are rejected without performing the action

### Requirement: Localized and recoverable widget

SR/EN SHALL cover labels and configurable templates. Account users SHALL bypass guest form; guest email/phone SHALL be independently optional. SSE SHALL reconnect and replay more than one page without duplicated IDs. Logout SHALL unmount private state. Product context SHALL use actual selection and server validation.

#### Scenario: Stream resumes after disconnect

- WHEN the SSE connection drops and the browser reconnects with a Last-Event-ID cursor
- THEN the server replays only events after that cursor, bounded per conversation, without duplicated message ids

#### Scenario: Both locales fully cover the interface

- WHEN the widget renders in SR or EN
- THEN every label, status, template and admin-visible chat string resolves from the active locale catalog
- AND the SR and EN catalogs contain identical key sets so no raw key or empty label can appear

#### Scenario: Chat remains usable on small screens

- WHEN the storefront is viewed below the 768px breakpoint
- THEN the chat is reachable through the dedicated mobile route with the composer, status and attachment controls fully usable

### Requirement: Honest status and retention

Availability SHALL require an enabled operator explicitly marked available, not bot connectivity. Delivered SHALL NOT mean read. The widget SHALL disclose Telegram/Google processing and retention. System templates SHALL NOT enqueue recursive external delivery. Deletion/retention SHALL cascade through chat storage; external copies require separate handling.

#### Scenario: Send from the message composer

- WHEN Enter is pressed in the message field
- THEN the same form submission as the Send button runs without adding a newline
- WHEN Shift+Enter is pressed or an IME composition is being confirmed
- THEN typing continues without sending
- Empty drafts, held-key repeats and attempts during an in-flight send SHALL NOT submit another message

#### Scenario: Grey checkmark means accepted

- WHEN the server has persisted the message and its outbox task
- THEN the widget shows the single grey checkmark state

#### Scenario: Blue double checkmark means delivered

- WHEN Telegram accepts the send and the Telegram message id is stored
- THEN the widget shows the blue double checkmark state
- AND no read receipt is implied, because delivered is never presented as read

#### Scenario: Failed delivery is disclosed

- WHEN a message ends in the `error` status
- THEN the widget and the admin dialog show a distinct failure state
- AND the original message text remains visible to the shopper and the operator

#### Scenario: Retention is configurable and bounded

- WHEN an admin sets the conversation retention
- THEN values outside 7–730 days (default 90) are rejected
- AND expired conversations cascade-delete messages, attachments and delivery tasks in chat storage

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

#### Scenario: Oversized chat HTTP bodies

- WHEN the body parser rejects a request exceeding the text or image upload limit
- THEN chat endpoints return HTTP 413 with `PAYLOAD_TOO_LARGE`, without reflecting the request body
- AND unrelated API errors retain the default Medusa error handling

#### Scenario: Normalized attachment limits

- WHEN any accepted image is stored
- THEN it is re-encoded to JPEG with max side 1600 px, quality 85 and a final size cap of 2 MiB
- AND animated or undecodable input is rejected, unsupported types return 415 `CHAT_IMAGE_TYPE_UNSUPPORTED` and oversized uploads return 413
- AND a conversation holding 50 attachments rejects further images with 409 `CHAT_IMAGE_LIMIT`

## ADDED Requirements

### Requirement: Storefront chat proxy

The Next.js storefront SHALL proxy every browser chat call through a same-origin route so the browser never contacts the Medusa origin directly. The proxy SHALL allowlist chat paths and methods, resolve the tenant from server-side environment configuration, forward auth cookies and the visitor id, and translate upstream failures into the chat error contract.

#### Scenario: Browser never sees the Medusa origin

- WHEN the widget is loaded on any production domain
- THEN all chat requests target same-origin `/api/chat/...` routes
- AND the response `Access-Control-Allow-Origin` is exactly the configured storefront origin

#### Scenario: Unknown proxy path is refused

- WHEN a client requests a path or method outside the chat allowlist through the proxy
- THEN the proxy returns 404 or 405 without forwarding the request upstream

#### Scenario: Upstream outage is reported honestly

- WHEN the Medusa origin is unreachable when a chat route is invoked
- THEN the route answers 503 with `UPSTREAM_UNAVAILABLE` in the chat error shape
- AND no HTML error page or upstream detail is returned to the widget

### Requirement: Chat rate limits and error contract

Every chat entry point (REST, SSE and Telegram webhook) SHALL enforce Redis-backed limits with per-scope budgets, and every chat failure SHALL use one error shape. The system SHALL NOT fall back to an unlimited counter store when Redis is unavailable.

#### Scenario: Budgets per action class

- WHEN clients exceed the budgets (history/session reads, sends per session, image and message writes, storefront POSTs, admin reads, SSE connections, webhook deliveries), the corresponding scope overflows or the global flood budget is exceeded
- THEN the server responds 429 with the chat error shape and the action is not executed
- AND per-conversation parallel streams stay within their connection cap

#### Scenario: Counter store outage fails closed

- WHEN Redis is unreachable for a rate-limited request
- THEN the request is denied with the retryable rate-limit error instead of being processed unlimited

#### Scenario: Telegram webhook flood guard

- WHEN anonymous webhook traffic exceeds the anonymous or global budget
- THEN excess deliveries are rejected with 429 before any Telegram processing
- AND legitimate operator and customer traffic within budget continues unaffected
