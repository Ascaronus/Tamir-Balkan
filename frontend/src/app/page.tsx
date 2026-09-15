import CatalogPage from "./[countryCode]/catalog/page"
export { generateMetadata } from "./[countryCode]/catalog/page"

export default async function Home({ searchParams }: {
  searchParams: Promise<import("@/lib/store/search-params").CatalogQuery>
}) {
  return <CatalogPage params={Promise.resolve({ countryCode: "rs" })} searchParams={searchParams} />
}
