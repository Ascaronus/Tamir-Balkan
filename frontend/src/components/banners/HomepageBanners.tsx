'use client'
import { BannerCarousel } from '@/lib/banners/shared/banner-carousel'
import type { Carousel } from '@/lib/banners/shared/banner-model'
import { localizedPath } from '@/lib/i18n/paths'
import type { Locale } from '@/lib/i18n/config'
export function HomepageBanners({carousel,locale}:{carousel:Carousel;locale:Locale}){return <BannerCarousel carousel={carousel} locale={locale} resolveLink={url=>url.startsWith('/')?localizedPath(url,locale):url} />}
