# TAMIR storefront redesign — release notes

The existing Next.js storefront now uses the approved TAMIR Figma concept:
white, black, gray and dark fuchsia (#842154). The supplied TAMIR logo remains
unchanged; Next Image delivers appropriately sized versions while preserving
its 2048:1613 aspect ratio (108px desktop / 76px mobile).

## Included

- Responsive header, live category navigation, search, language switch and cart badge.
- Desktop catalog sidebar and accessible native mobile filter dialog.
- Size, color, inclusive price range and all four backend sorts through
  `/store/catalog/products`. Repeated sizes preserve decimal commas. URLs retain
  the selection and pagination resets when filters or sort change.
- Product cards use `product.catalog.price` and `preferred_variant_id`; real
  products, stock, images and review aggregates come from Medusa.
- Product gallery/zoom, aligned color selection, sizes, quantity and cart actions.
- Catalog and product page use regional tax context. Signed-in requests also
  carry the customer token for customer-group prices. RSD formatting explicitly
  keeps two decimal places to avoid server/browser CLDR differences.
- Reviews retain authenticated publishing/voting, CAPTCHA, one-review limits,
  public name privacy and manual section/item collapse. Negative helpfulness
  scores start individually collapsed; the section starts expanded.
- Cart and checkout share the design. Checkout displays totals returned by
  Medusa after applying the delivery option, including delivery in the total.
- Registration retains all existing required fields, CAPTCHA and the existing
  email-code activation flow. A single accessible/autofill-compatible code input
  is presented as six cells. The spam reminder remains prominent.
- Account orders/profile tabs, editable address/profile, order history/reorder.
- Existing legal pages, cookie controls and SEO metadata remain available.

The editorial banner and icon source assets are shared with the Figma work.
Illustrative product photos and demo reviews are not shipped as product data.
No backend schema changes, new environment variables or migrations are required
by this frontend release. Existing Medusa and Turnstile configuration is required.

## Validation

- Frontend TypeScript, ESLint and production build.
- 82 automated tests, including the registration bypass regression, OTP,
  review collapse/privacy, catalog parameter serialization and decimal prices.
- Chromium checks at 320, 390, 768 and 1440px: overflow, image loading and
  server/client hydration.
- Browser flow against an isolated local Store API fixture: filters/sorting,
  variant selection, review collapse, cart quantities, invalid/valid OTP,
  review submission and voting, shipping quote and order completion.
  The browser fixture replaces CAPTCHA and email delivery; it does not send
  real email, create production accounts or place production orders.

## Deploy on the existing VPS

Use the existing guarded deployment script, which builds an isolated release
before switching the running processes:

```bash
cd /root/tamir_balkan &&
git pull --ff-only &&
bash scripts/deploy-vps.sh
```

Do not deploy local `.next` output or test fixtures. The VPS builds using its own
existing environment, including the real public Turnstile key. After activation,
check a real product, filters, cart, checkout delivery totals and email-code
registration with the actual Store API and email service.
