import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { LocaleProvider } from "@/components/i18n/LocaleProvider"
import { getLocale } from "@/lib/i18n/server"
import { getMessages } from "@/lib/i18n/messages"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const messages = getMessages(locale)
  return {
    title: messages.meta.title,
    description: messages.meta.description,
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
      lang={locale === "sr" ? "sr" : "en"}
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <LocaleProvider locale={locale} messages={messages}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  )
}
