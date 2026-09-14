# Store repair — 14 September 2026

The storefront previously showed only one image, used API response order for cart rows, allowed attempts to buy unavailable variants, omitted translated category metadata, and stopped after the first 24 products. Checkout could clear a cart even when completion did not return an order. The XML importer used product-module calls that did not consistently create cross-module pricing and inventory links.

Changes:
- Serbia-only storefront and address forms, with redirects from old `/me/` links and bare `/rs` or `/me` addresses.
- English and Serbian Latin interface, persistent switcher, category and product metadata translations, existing English category-name fallbacks.
- Complete image gallery, thumbnails, hover enlargement and keyboard-accessible large-photo dialog. Variant-specific photos have priority; remaining product photos remain accessible.
- Size/color options, stock-aware purchase controls, quantity selection and cart feedback. Backend inventory checks remain authoritative.
- Stable cart ordering, serialized cart requests, duplicate cart-creation prevention, error display, and preservation of an existing cart on transient network failures.
- Search and pagination; locale-aware prices using Medusa v2 major currency units.
- Address confirmation before shipping lookup. Only the implemented payment method is offered. Cart storage is cleared only after an order is returned.
- Importer: all offer photos, Ukrainian/Russian/English size names, explicit stock handling, RSD prices, channel/warehouse/profile links and repairs for missing variant pricing/inventory links. Unknown quantity remains zero. Ambiguous duplicate sizes fail before writes.

## Validation

Both applications built successfully locally. TypeScript and frontend ESLint passed. The store API accepted the expanded product fields and returned all photos and options. A local production SSR request returned HTTP 200 against the existing backend. Automated regression tests cover stock limits, cart ordering, invalid quantities, major-unit prices, image selection/URLs, category translations, dictionary parity and feed parsing.

Run tests with Node 22.18+ or Node 24:

```sh
node --test frontend/tests/commerce.test.mjs
```

## Deployment

SSH was unavailable from the repair session (`Network is unreachable`). The GitHub connector also rejected writes with `403 Resource not accessible by integration`. Changes are preserved in a local commit and an exported patch, not in upstream main. No server deployment or PM2 restart is claimed. After obtaining this revision, run on the VPS:

```sh
cd /root/tamir_balkan
git fetch origin main
git show origin/main:scripts/deploy-vps.sh > /tmp/tamir-deploy.sh
bash /tmp/tamir-deploy.sh
```

The script checks local tracked changes, backs up PostgreSQL and server files, builds both applications, restarts the existing PM2 processes and checks both HTTP endpoints. It needs `pg_dump` installed. On a build failure it stops with a backup path instead of starting a broken build. `DEPLOY.md`, passwords, SSH keys and authentication settings were not changed.

## Import

The source feed returned HTTP 403 from this session, so an end-to-end live import was not verified. Before importing, choose the actual warehouse and confirm the intended UAH/RSD rate. Existing translations can be supplied in `metadata.i18n.en` / `metadata.i18n.sr` or through Medusa translations. Without a translation API key, arbitrary source product descriptions are not automatically translated.

```sh
cd backend
ROZETKA_DRY_RUN=true ROZETKA_STOCK_LOCATION_ID=YOUR_WAREHOUSE_ID ROZETKA_UAH_TO_RSD=YOUR_RATE npx medusa exec ./src/scripts/import-rozetka-xml.ts
```

After reviewing the dry run, run the same command without `ROZETKA_DRY_RUN=true`. Do not run the demo seed or demo RSD-price script on a real catalog. Confirm shipping prices, warehouse linkage, actual quantities and a test checkout before accepting customer orders.

## Applying the exported patch when GitHub writes are unavailable

Copy `Tamir-Balkan-repair.patch` from the delivered archive to the VPS using your normal SSH/SFTP client. From a clean checkout of the original commit `0dce8168dcb6e8190a5f931d20e9d71d82fcb53b`:

```sh
cd /root/tamir_balkan
git apply --check /path/to/Tamir-Balkan-repair.patch
git am /path/to/Tamir-Balkan-repair.patch
bash scripts/deploy-vps.sh
```

If the check reports conflicts, stop and reconcile server changes; do not force or overwrite them. No SSH key, password, session token or environment file is included in the patch.

## Remaining validation limits

Production browser interaction and end-to-end checkout against a deployed repaired build were not verified: server code could not be deployed. Production-mode local HTTP checks passed for EN/SR catalog, cart, checkout and the Montenegro-to-Serbia redirect. The live importer source returned HTTP 403, so only importer parsing/unit checks and compilation were verified.

## Live 404 diagnosis

The live root `/` and `/rs/catalog` returned HTTP 200; bare `/rs` and `/me` returned HTTP 404 because they had no page or redirect. The patch adds redirects to `/rs/catalog`. Removed product URLs can still correctly return 404. These redirect changes require deployment.
