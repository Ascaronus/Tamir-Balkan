"use client"
import { useRouter } from "next/navigation"
import { useLocaleContext } from "./LocaleProvider"
import { localizedPath } from "@/lib/i18n/paths"
export function useLocalizedRouter() {
  const router = useRouter()
  const { locale } = useLocaleContext()
  return { ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(localizedPath(href, locale), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(localizedPath(href, locale), options),
  }
}
