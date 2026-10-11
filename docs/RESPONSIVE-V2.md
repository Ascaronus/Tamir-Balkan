# TAMIR responsive storefront v2

Current layout notes reviewed on 2026-10-11; the verification record below describes the original release.

Design source: [Figma, page 04 · TAMIR / Responsive v2](https://www.figma.com/design/2u9V1x7faa2yieZqRP0KaF/TAMIR?node-id=79-1215).

## Layout and typography

The catalog and product page now use a container up to 2560 px wide. Horizontal
padding grows from 48 px at 1920 px to 80 px at 2560 px. Tablets use 32 px;
phones use 20 px, or 16 px at widths of 360 px and below. Checkout and account
forms retain a narrower reading width.

Manrope is served locally by Next's font pipeline. Product names use 18/28 px
on desktop and 16/24 px on phones. Small labels are at least 14 px. Catalog
cards use a 4:5 photo frame and responsive columns: four at 1800 px and above,
three at 1401–1799 px, and two below. Mobile navigation and filter drawers start
at 900 px. Photos keep their aspect ratio and crop to the card frame.

Product thumbnails sit to the left on desktop and below the main photo on
mobile. The desktop hero retains the ratio from Figma frame 79:1501
(1228 × 1040), but the current implementation uses 80% gallery width, capped
at 982.4 × 832 px. The initial image uses contain without magnification;
1.8× zoom activates on mouse hover. Mobile uses a 4:5 frame capped at 512 px
high. These limits follow the later request to reduce the photo by 20%.
Clicking opens the complete image in a dialog. Color selectors have centered
32 px swatches in 44 px controls. Delivery/return details use an expandable
section. Reviews preserve their existing voting, authentication and collapse
rules. Without published reviews, empty stars remain and numeric zero is hidden.
When available quantity is at most one, both quantity buttons and the input
are disabled; this does not disable buying an available single unit.

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

The original responsive-only change added no backend migration or environment
variable. For the current complete application follow [DEPLOY.md](../DEPLOY.md)
and [TESTING.md](TESTING.md); do not treat that historical statement as a
replacement for current setup requirements.
