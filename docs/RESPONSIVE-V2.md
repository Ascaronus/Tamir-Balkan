# TAMIR responsive storefront v2

Design source: [Figma, page 04 · TAMIR / Responsive v2](https://www.figma.com/design/2u9V1x7faa2yieZqRP0KaF/TAMIR?node-id=79-1215).

## Layout and typography

The catalog and product page use a container up to 2560 px wide. The product
overview is centered within it and capped at 1200 px. Horizontal
padding grows from 48 px at 1920 px to 80 px at 2560 px. Tablets use 32 px;
phones use 20 px, or 16 px at widths of 360 px and below. Checkout and account
forms retain a narrower reading width.

Manrope is served locally by Next's font pipeline. Product names use 18/28 px
on desktop and 16/24 px on phones. Small labels are at least 14 px. Catalog
cards use a 4:5 photo frame and responsive columns: four at 1800 px and above,
three at 1401–1799 px, and two below. Mobile navigation and filter drawers start
at 900 px. Photos keep their aspect ratio and crop to the card frame.

Product thumbnails sit to the left on desktop and below the main photo on
mobile. Following the tamir.ua reference (2026-10-03), the main photo uses a
portrait 3:4 frame up to 460 × 613 px, capped at 75% of the viewport height.
Main photos and thumbnails display the complete image without cropping. Hover
does not magnify the photo; clicking opens the existing full-image dialog.
This intentionally replaces the oversized gallery in Figma frame 79:1499;
the existing typography, colors and thumbnail placement remain in use.
Color selectors have centered
32 px swatches in 44 px controls. Delivery/return details use an expandable
section. Reviews preserve their existing voting, authentication and collapse
rules.

The additional-products section loads up to five other catalog products when
approaching the bottom of the page. It waits for authentication, passes the
current customer token for pricing, excludes the current product, and clears
visible stale results when the customer or language changes. Failure of this
optional section does not block the product or cart. It uses catalog ordering,
not a personalized recommendation engine.

## Verification — 2026-09-30

- Frontend ESLint and the existing 96-test suite passed.
- Production Next build passed, including TypeScript and font generation.
- Chromium screenshots and geometry checks at 2560×1440, 1920×1080, 1440×900,
  1024×768, 768×1024, 430×932, 390×844, 360×800 and 320×740: no horizontal
  document overflow, off-screen content or broken loaded images in catalog and
  product pages; Manrope loaded; no browser runtime errors.
- Registration, login, password reset and checkout layouts checked at 320 and
  1920 px. These are browser viewport checks, not physical-device certification.
- Fixture-backed browser interactions passed: decimal-size and price filters,
  sorting, retained filters, drawer dismissal, variants, centered color selection,
  review expansion, guest add-to-cart and quantity changes, guest checkout entry,
  thumbnail selection, zoom keyboard navigation, delivery details and dynamic
  additional products. No production customers, emails or orders were created.

Deploy using the existing `scripts/deploy-vps.sh` flow. No new environment
variables, backend migrations or dependencies are required by this change.
