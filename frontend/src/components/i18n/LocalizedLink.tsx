"use client"
import NextLink from "next/link"
import type { ComponentProps } from "react"
import { useLocaleContext } from "./LocaleProvider"
import { localizedPath } from "@/lib/i18n/paths"

export default function LocalizedLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const { locale } = useLocaleContext()
  return <NextLink {...props} href={typeof href === "string" ? localizedPath(href, locale) : href} />
}
