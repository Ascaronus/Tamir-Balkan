import type { Metadata } from "next"
import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { terms } from "@/lib/legal/content"
import { siteUrl } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getTranslations()
  return { title: terms[locale].title, alternates: { canonical: siteUrl("/terms") }, robots: { index: false, follow: true } }
}

export default async function TermsPage() {
  const { locale } = await getTranslations()
  const content = terms[locale]
  return <StoreShell countryCode="rs">
    <main className="mx-auto max-w-3xl px-5 py-10 text-[var(--store-text)]">
      <h1 className="text-3xl font-semibold">{content.title}</h1>
      {content.sections.map(section => <section key={section.title} className="mt-7"><h2 className="text-xl font-semibold">{section.title}</h2><p className="mt-3 whitespace-pre-line leading-7">{section.text}</p></section>)}

    </main>
  </StoreShell>
}
