# Product structured data

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
  TAMIR is not assumed to manufacture every product sold by the shop.
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

`shippingDetails` and `hasMerchantReturnPolicy` are intentionally not fabricated.
Before adding them, confirm and publish real destination countries, shipping
prices and delivery times, return period/method and who pays return shipping.
The existing test-project terms do not establish these policies. Google may
continue to report these optional fields, and missing reviews on unrated products.

After deployment, inspect affected URLs in Google's Rich Results Test and Search
Console, then request validation/re-crawling. Search Console is not updated at
deployment time; Google must crawl the new page.

References:
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
