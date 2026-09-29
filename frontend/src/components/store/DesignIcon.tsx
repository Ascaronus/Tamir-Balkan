/* Original vector assets shared with the TAMIR Figma component library. */
export function DesignIcon({ name }: { name: "search" | "user" | "bag" | "menu" | "close" | "mail" | "filter" }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/design/${name}.svg`} width={24} height={24} alt="" aria-hidden="true" />
}
