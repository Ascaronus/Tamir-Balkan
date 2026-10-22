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
