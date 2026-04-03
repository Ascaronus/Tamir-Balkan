import Link from "next/link"
import { redirect } from "next/navigation"
import { StoreShell } from "@/components/store/StoreShell"
import { getHomeRedirectPath } from "@/lib/store/home-redirect"
import { getTranslations } from "@/lib/i18n/server"

/** Редирект по env и «региону по умолчанию» должен читаться при запросе, а не только при сборке. */
export const dynamic = "force-dynamic"

export default async function Home() {
  const redirectPath = await getHomeRedirectPath()
  if (redirectPath) {
    redirect(redirectPath)
  }

  const { t } = await getTranslations()

  return (
    <StoreShell>
      <section className="border-b border-[var(--store-border)] bg-[var(--store-bg-muted)] px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--store-text-muted)]">
            {t("home.badge")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--store-text)] sm:text-4xl">
            {t("home.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--store-text-muted)]">
            {t("home.subtitle")}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          {t("home.regionHeading")}
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Link
            href="/rs/catalog"
            className="group flex flex-col rounded-2xl border border-[var(--store-border)] bg-white p-8 shadow-sm transition hover:border-[var(--store-accent)] hover:shadow-md"
          >
            <span className="text-lg font-semibold text-[var(--store-text)] group-hover:text-[var(--store-text)]">
              {t("home.serbiaTitle")}
            </span>
            <span className="mt-2 text-sm text-[var(--store-text-muted)]">
              {t("home.serbiaDesc")}
            </span>
            <span className="mt-6 inline-flex w-fit items-center text-sm font-medium text-[var(--store-accent)]">
              {t("home.toCatalog")}
            </span>
          </Link>

          <Link
            href="/me/catalog"
            className="group flex flex-col rounded-2xl border border-[var(--store-border)] bg-white p-8 shadow-sm transition hover:border-[var(--store-accent)] hover:shadow-md"
          >
            <span className="text-lg font-semibold text-[var(--store-text)]">
              {t("home.montenegroTitle")}
            </span>
            <span className="mt-2 text-sm text-[var(--store-text-muted)]">
              {t("home.montenegroDesc")}
            </span>
            <span className="mt-6 inline-flex w-fit items-center text-sm font-medium text-[var(--store-accent)]">
              {t("home.toCatalog")}
            </span>
          </Link>
        </div>
      </section>
    </StoreShell>
  )
}
