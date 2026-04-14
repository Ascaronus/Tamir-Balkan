import { useCart } from "./CartProvider"

export function CartLink({ href }: { href: string }) {
  const { itemCount, isReady } = useCart()

  return (
    <span className="relative inline-flex items-center">
      {isReady && itemCount > 0 ? (
        <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--store-accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
      <span className="sr-only">Cart</span>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0"
        aria-hidden
      >
        <path
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 6h15l-1.5 9h-12z"
        />
        <path
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          d="M6 6L5 3H2"
        />
        <circle cx="9" cy="20" r="1.5" fill="currentColor" />
        <circle cx="18" cy="20" r="1.5" fill="currentColor" />
      </svg>
    </span>
  )
}

