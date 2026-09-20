import type { Metadata } from "next"
import Link from "next/link"
import { StoreShell } from "@/components/store/StoreShell"
import { CookieSettingsButton } from "@/components/privacy/CookieConsent"
import { getTranslations } from "@/lib/i18n/server"
import { privacyPolicy } from "@/lib/legal/content"
import { siteUrl } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getTranslations()
  return { title: privacyPolicy[locale].title, alternates: { canonical: siteUrl("/privacy") }, robots: { index: false, follow: true } }
}

export default async function PrivacyPage() {
  const { locale, t } = await getTranslations()
  const content = privacyPolicy[locale]
  const email = process.env.TAMIR_PRIVACY_EMAIL?.trim()
  const validEmail = email && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)
  return <StoreShell countryCode="rs">
    <main className="mx-auto max-w-3xl px-5 py-10 text-[var(--store-text)]">
      <h1 className="text-3xl font-semibold">{content.title}</h1>
      {content.sections.map(section => <section key={section.title} className="mt-7"><h2 className="text-xl font-semibold">{section.title}</h2><p className="mt-3 leading-7">{section.text}</p></section>)}
      <section className="mt-7"><h2 className="text-xl font-semibold">{t("legal.privacyContact")}</h2>
        <p className="mt-3">{validEmail ? <a className="underline" href={`mailto:${email}`}>{email}</a> : t("legal.contactPending")}</p>
      </section>
      <div className="mt-8 flex flex-wrap gap-5 text-sm">
        <CookieSettingsButton />
        <Link href="/cookies" className="underline">{t("cookies.policy")}</Link>
        <Link href="/terms" className="underline">{t("legal.terms")}</Link>
        <a href="https://www.poverenik.rs/" className="underline">Poverenik</a>
      </div>
    </main>
  </StoreShell>
}
