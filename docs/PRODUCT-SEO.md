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

The merchant covers return shipping for manufacturing defects. This is shown
on product pages without imposing a 14-day limit on statutory defect remedies.
`hasMerchantReturnPolicy` remains pending: the stated "14 days only for defects"
condition does not describe the general Serbian right to withdraw from an online
purchase. Confirm who pays return shipping for a non-defective item before
publishing a general return policy and markup. The existing test-project terms
also need a separate commercial-policy update with actual seller information.
Optional review warnings can remain on products with no published reviews.

After deployment, inspect affected URLs in Google's Rich Results Test and Search
Console, then request validation/re-crawling. Search Console is not updated at
deployment time; Google must crawl the new page.

References:
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
