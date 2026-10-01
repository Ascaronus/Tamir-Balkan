/** Draw both circles in one coordinate system, including at fractional browser zoom. */
export function ColorSwatch({ color, selected, compact = false }: { color: string; selected: boolean; compact?: boolean }) {
  const radius = compact ? 11 : 16
  return <svg className="color-swatch" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
    <circle cx="22" cy="22" r={radius} fill={color} />
    {!selected && <circle cx="22" cy="22" r={radius - 0.5} fill="none" stroke="currentColor" strokeOpacity="0.15" />}
    {selected && <circle className="color-swatch-ring" cx="22" cy="22" r={radius + 5} fill="none" stroke="var(--store-accent)" strokeWidth="2" />}
  </svg>
}
