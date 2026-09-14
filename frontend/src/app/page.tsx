
import CatalogPage from "./[countryCode]/catalog/page"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category_id?: string; page?: string; q?: string }>
}) {
  return <CatalogPage
    params={Promise.resolve({ countryCode: "rs" })}
    searchParams={searchParams}
  />
}
