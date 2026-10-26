# Storefront and Figma alignment

Design source: [04 · TAMIR / Responsive v2](https://www.figma.com/design/2u9V1x7faa2yieZqRP0KaF/TAMIR?node-id=79-1215).
Reviewed on 2026-10-22. Earlier Screens and foundations remain historical;
the responsive page is the source for current storefront work.

## Catalog sorting and ratings

- Sorting follows desktop node `79:1268`: 48px height, 12px padding,
  Manrope Medium 16/24, 8px between the label and the 20px down icon.
  The arrow follows the label rather than the browser-dependent right edge.
  Narrow mobile controls retain 14px text and 8px horizontal padding.
- A transparent native select covers the visible control, preserving keyboard
  navigation, screen-reader naming, native mobile pickers and existing URLs.
  Keyboard focus outlines the entire visible control.
- Rating stars use the original 16px vector from component `30:54`, 4px gaps,
  and `--store-text` (#0a0a0a). Empty portions use `--store-border` (#e8e8e8).
  Fractional fills use the existing rating calculation. Review text stays
  `--store-text-muted` (#5c5c5c). Mobile catalog cards retain one compact star.
- The extra review-bubble icon is omitted when stars are present, as in Figma.
  If the review service is unavailable, its existing text/icon fallback stays.
- `public/design/down.svg` and `star.svg` are exact Figma SVG exports,
  retrieved through the plugin export API; no temporary asset URLs are shipped.

## Previously accepted differences

Keep Manrope and the readable responsive typography, search beside the catalog
heading on desktop and below it on mobile, the winter family campaign banner,
interactive larger color swatches and their centered selection rings, and the
80% product gallery with pointer zoom. Do not restore the old illustration,
small non-interactive swatches or full-size gallery from historical frames.
Real product names, photos, prices, availability, categories and review counts
remain live data rather than the demonstration content in Figma.

## Figma updates

On page 04, remaining Inter overrides in profile/checkout fields now use
Manrope. The mobile card component's price is 16/24, matching its existing
screen overrides; the 320px catalog heading is 28/36. All five catalog search
fields retain the agreed location and now contain an editable 44px search
button, matching the implemented control and text inset.

## Validation

- Existing frontend suite: 147 tests passed; production build and TypeScript
  passed; ESLint has no errors (9 pre-existing warnings).
- Chromium with a local Store API fixture: Serbian and English at 320, 390,
  768, 1440, 1920 and 2560px. Verified no horizontal overflow or runtime errors,
  16px star geometry and colors, 8px label-to-arrow spacing, visible keyboard
  focus, pointer/native selection, keyboard sort changes and search submission.
- Figma composition screenshots reviewed for desktop/mobile catalog and profile;
  all text on the active responsive page uses Manrope.
- Browser fixture checks do not certify physical devices or production data.

## Follow-up alignment — 2026-10-25

- Reviews now follow the responsive design: heading, overall rating, caption,
  author/score row, date, body, horizontal helpfulness controls, and full-width
  per-review collapse button. Existing voting, moderation, submission locks and
  authentication remain in place. Guest vote links lead to login. The desktop
  introduction has the write-review action; the top section toggle remains.
- Product and review-summary stars have 8px gaps; catalog stars keep 4px.
  Helpfulness icons are original 16px exports from nodes
  `I85:2310;43:499;43:428` and `I85:2310;43:499;43:432`.
- Product breadcrumbs use the live category and localized URLs. Color comes
  before size. Availability uses the design's green indicator and 14/20 type.
  The 1920px column ratio is 960:816, with the existing 48px gap. Mobile photo
  selectors use dots while keeping accessible buttons and the zoom dialog.
- Composition/care is an accordion only when real material/care data exists;
  no demo composition, VAT claim, size chart or support promise is invented.
- Catalog rows use 24px gaps. Mobile count sits beside the heading; the filter
  button is 118px, sorting takes the remaining width. Desktop pagination uses
  page numbers; mobile Load more appends products, deduplicates IDs, guards
  repeated clicks and supports retry without losing the current list.
- Checkout/profile labels have 8px gaps to controls. Introductory spacing is
  aligned. Cart details stack title, variant, price, quantity and removal;
  the continue-shopping action is a text link and extra separators are removed.
- Previously agreed typography, campaign image, larger color choices, 80%
  product image with zoom, two-line card title reservation and legal links stay.

### Earlier design/content decisions (footer resolved below)

The Figma footer has conflicting 48px/80px vertical padding and different mobile
links. Keep the shared working footer until that design is unified; do not remove
legal links to match an incomplete example. Real material/care and size-guide
content must come from the catalog. These are not certified pixel-identical areas.

### Follow-up verification

- 149 frontend tests passed, including append/deduplication, duplicate-click
  protection, retry and pricing-context isolation for Load more.
- Production build and TypeScript passed. ESLint: no errors; 9 existing warnings.
- Local Chromium with a disposable Store API fixture: SR/EN at 320, 390, 768,
  1440, 1920 and 2560px; 84 screen/state checks covering catalog, product,
  reviews, populated cart, guest checkout, validation and signed-in profile.
  No horizontal overflow or uncaught browser errors. Checked sort navigation,
  Load more, review collapse/expand, guest voting links, mobile image selection,
  24px catalog row gaps, 118px mobile filter, 8px form gaps and 16px vote assets.
- Fixture data and browser tooling are external to the shipped repository;
  this does not certify physical devices, real checkout or payment processing.

### Owner decisions — 2026-10-25

- Keep production footer spacing: 48px vertical on desktop, 32px at <=900px.
  Preserve production links and its compact mobile layout. Synchronize the
  current responsive Figma page to this implementation, not historical pages.
- Product Attributes are shown in a conditional Dimensions and details accordion:
  length, width, height, weight, origin country, manufacturer code and HS code.
  Empty fields disappear; no populated fields means no accordion. Explicit zero
  is retained, as are decimal values. Country labels follow the storefront locale.
  These are product-level attributes from Medusa, not a fabricated size chart or
  arbitrary metadata. The built-in admin form has no measurement-unit labels:
  values are preserved without inventing conversions or a cm/kg convention.
- Material continues to use the existing Composition and care accordion. Example
  supplied by owner: `50% viscose, 50% acrylic.`; never replace it with demo data.
- Owner confirms the shop operates without VAT. Do not add a VAT-inclusive claim
  or new VAT charge. Existing tax configuration is outside this UI change.
- Support contact channels are not ready. Keep the current public interface;
  future setup checklist is in SUPPORT-CONTACTS.md.

- Figma synchronization completed on active page `79:1215`: 33 footers use the
  production link sets and 48/32px spacing. Historical design pages are unchanged.

## Add-to-cart confirmation — 2026-10-26

Figma component set: https://www.figma.com/design/2u9V1x7faa2yieZqRP0KaF?node-id=187-3637

- Latest owner decision: Continue shopping on the left, Go to cart on the right. Mobile stacks Continue first, Go to cart second.
- Native modal dialog opens only after a successful add operation; failures retain the existing error feedback.
- SR: Proizvod je dodat u korpu / Nastavi kupovinu / Idi u korpu. EN: Product added to cart / Continue shopping / Go to cart.
- Show the added variant and quantity, server-calculated line amount allocated to that quantity, updated cart quantity and merchandise total excluding delivery. Product selection supplies localized title/options and current image; other add buttons use the localized cart snapshot.
- Escape, close and Continue dismiss; native modal focus containment, focus restoration and body scroll lock. No timed disappearance. Navigation/locale/session changes discard the confirmation.
- Desktop 560 px, 32 px padding; mobile viewport minus 32 px, 20 px padding. Reuse storefront typography, buttons, colors and image fallback. Exact Figma success/close SVGs are bundled locally.
