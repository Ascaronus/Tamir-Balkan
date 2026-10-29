// Medusa Admin uses React 18; storefront uses React 19 and a frontend-only build root.
// Copy the canonical dependency-free renderer instead of importing the other app's React.
// A frontend regression test compares every byte to prevent divergent implementations.
import { copyFileSync } from 'node:fs'
for (const file of ['banner-model.ts','banner-carousel.tsx','banner-carousel.css']) {
 copyFileSync(new URL('../backend/src/shared/'+file,import.meta.url),new URL('../frontend/src/lib/banners/shared/'+file,import.meta.url))
}
