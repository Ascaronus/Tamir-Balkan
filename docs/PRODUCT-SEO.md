# Product URLs and structured data

Reviewed against the code on 2026-10-11.

## Localized URLs

SR product pages use `/rs/products/<product.handle>`; EN pages use `/en/products/<metadata.en_handle>`. Admin Rozetka imports generate readable handles from prepared content. Completed older imports can be normalized with `normalize-rozetka-products.ts`; the default is dry run. Old imported handles are retained as aliases so existing links can redirect. See [LOCALIZATION.md](LOCALIZATION.md) for native translations, stable URL rules and the admin URL widget.

A title edit does not automatically change an established English URL. A managed URL change reserves the old alias. Query parameter `v_id` selects a variant, while canonical identifies the product without the query. Links can therefore preserve variant selection without creating one canonical page per size/color.

EN readiness requires nonempty native English title and description without Cyrillic characters. Incomplete EN content stays `noindex` and is omitted from the EN sitemap. SR/EN alternate links are emitted only where the target content is ready. Categories use native translated names and per-language handles. Both languages serve the same Serbia/RSD market and share stock, checkout and customer accounts.

See [BROWSER-LANGUAGE.md](BROWSER-LANGUAGE.md) for home/account/cart routes and [GOOGLE-SEARCH-CONSOLE.md](GOOGLE-SEARCH-CONSOLE.md) for sitemap inclusion and expected index exclusions.

## Structured data

Product pages generate JSON-LD from the same public product prices and published
reviews shown to visitors. No authentication is forwarded for this server fetch.
Reviews are also rendered in the initial HTML; client requests still load each
signed-in customer's voting and submission state.

- `offers`: real calculated variant prices, currency, availability and variant URL.
- `aggregateRating`: the published review count and average, only when count > 0.
- `review`: the published first page of reviews, author name, text, date and stars.
  Private account properties are never copied into JSON-LD.
- `brand`: a nonempty product metadata string `brand`, or `rozetka_vendor` from
  the existing XML importer. The brand is also shown beside the product details.
  The merchant confirmed that the catalogue is TAMIR-branded on 2026-09-29;
  products without an explicit brand default to TAMIR.
- GTIN: validated EAN/UPC/barcode of a single-variant product, or explicit product
  metadata `gtin`. Keep GTINs as strings to preserve leading zeroes. Internal SKUs
  must not be used as GTINs; a variant's identifier is not assigned to an entire
  multi-variant product.

If neither a valid offer nor reviews/aggregate exist, the page omits the incomplete
Product object. This does not add `noindex`, remove the page, or remove it from the
sitemap. Fill the real price for the storefront's Serbia region/RSD currency to
make an unreviewed product eligible for offer markup. Never add a fabricated zero
price or fabricated reviews just to silence a warning.

## Business information still needed

Confirmed on 2026-09-29: Serbia delivery costs 300 RSD and takes up to seven
days. RSD offers include destination RS, the 300 RSD shipping rate, and a transit
upper bound of seven days. A separate handling duration has not been confirmed
and is not invented. The full delivery promise is also visible on product pages.
These changes describe the published tariff; checkout still obtains its real
shipping charge from the Medusa shipping option configured by the administrator.
Keep that option at 300 RSD to match the published policy.

The merchant confirmed an additional return policy for manufacturing defects:
returns within three calendar months of receiving the goods, with return shipping
paid by TAMIR. Product pages show this in Serbian and English, explicitly without
excluding or shortening statutory consumer rights. Three months must not be
converted into a general 90-day return window in Google's markup.
`hasMerchantReturnPolicy` remains pending: defect returns are separate from the
general right to withdraw from an online purchase. Confirm who pays return
shipping for a non-defective item before publishing a general return policy and
markup. The existing test-project terms also need a separate commercial-policy
update with actual seller information.
Optional review warnings can remain on products with no published reviews.

After deployment, inspect affected URLs in Google's Rich Results Test and Search
Console, then request validation/re-crawling. Search Console is not updated at
deployment time; Google must crawl the new page.

References:
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing

## Internal links and product retirement (2026-10-12)

Default product-card links omit `v_id` when opening the page without it selects the same variant; deliberate color/filter selections remain addressable. A single-variant Offer uses the clean product URL. Multiple-variant Offers keep variant-specific URLs under one product canonical. General catalog navigation links to the canonical language home.

For discontinued stock, replacement products and URL changes, follow the decision table in [GOOGLE-SEARCH-CONSOLE.md](GOOGLE-SEARCH-CONSOLE.md). Do not reuse a product identity for an unrelated replacement or redirect every missing product to the homepage. No historical redirect or canonical should be removed solely to clear a Search Console exclusion.
