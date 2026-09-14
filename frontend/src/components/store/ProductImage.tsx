"use client"

import { useState } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"

export function ProductImage({ src, alt, className = "", eager = false }: { src?: string; alt: string; className?: string; eager?: boolean }) {
  const t = useTranslations()
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) return <span className="flex h-full min-h-20 items-center justify-center p-3 text-center text-xs text-[var(--store-text-muted)]">{t("product.noPhoto")}</span>
  // Direct images support Medusa uploads and external feed hosts without server-side proxy restrictions.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(src)} className={className} />
}
