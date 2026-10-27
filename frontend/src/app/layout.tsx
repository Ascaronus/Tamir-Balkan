import type { Metadata } from "next"
import { CookieConsent } from "@/components/privacy/CookieConsent"
import { Manrope } from "next/font/google"
import { LocaleProvider } from "@/components/i18n/LocaleProvider"
import { getLocale } from "@/lib/i18n/server"
import { getMessages } from "@/lib/i18n/messages"
import "./globals.css"

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "cyrillic"],
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const messages = getMessages(locale)
  return {
    title: messages.meta.title,
    description: messages.meta.description,
    authors: [{ name: "Igor Demin" }],
    other: { "date": "2026-09-14", "article:published_time": "2026-09-14T00:00:00+02:00" },
    openGraph: { type: "website", siteName: "TAMIR", title: messages.meta.title, description: messages.meta.description,
      images: [{ url: "https://tamir.rs/tamir-logo.png", width: 2048, height: 1613, alt: "TAMIR — Collection for men" }] },
    robots: { index: true, follow: true },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = getMessages(locale)

  return (
    <html
      lang={locale}
      className={`${manrope.variable} h-full antialiased`}
    >

      <body className="min-h-full font-sans">
        <LocaleProvider locale={locale} messages={messages}>
          {children}
          <CookieConsent />
        </LocaleProvider>
      </body>
    </html>
  )
}
