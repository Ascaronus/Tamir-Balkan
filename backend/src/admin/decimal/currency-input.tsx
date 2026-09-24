import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from "react"
import Original from "tamir-original-currency-input"
import { Input } from "@medusajs/ui"
import { normalizeDecimalDraft, parseDecimal } from "./number"
export * from "tamir-original-currency-input"

// Shared by product/variant prices, price lists, shipping, refunds, tax rates
// and discounts. Keep an editing string even when a parent stores a number.
const DecimalCurrencyInput = forwardRef<HTMLInputElement, ComponentProps<typeof Original>>(
  ({ value, defaultValue, onValueChange, transformRawValue, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => inputRef.current!)
    const [draft, setDraft] = useState(normalizeDecimalDraft(String(value ?? defaultValue ?? "")))
    useEffect(() => {
      const number = parseDecimal(draft)
      const outsideBounds = draft !== "" && (!Number.isFinite(number) ||
        (props.min != null && number < Number(props.min)) ||
        (props.max != null && number > Number(props.max)))
      inputRef.current?.setCustomValidity(outsideBounds
        ? `Enter a number${props.min != null ? ` ≥ ${props.min}` : ""}${props.max != null ? ` ≤ ${props.max}` : ""}` : "")
    }, [draft, props.min, props.max])
    useEffect(() => {
      const next = normalizeDecimalDraft(String(value ?? ""))
      if (value === undefined && defaultValue !== undefined) return
      setDraft(current => next === current ||
        (next !== "" && current !== "" && parseDecimal(next) === parseDecimal(current))
        ? current : next)
    }, [value, defaultValue])
    return <Original {...props} ref={inputRef} value={draft}
      decimalSeparator="." groupSeparator=" " disableGroupSeparators
      disableAbbreviations inputMode="decimal"
      transformRawValue={raw => normalizeDecimalDraft(transformRawValue ? transformRawValue(raw) : raw, draft)}
      onValueChange={(next, name, values) => {
        setDraft(next ?? "")
        onValueChange?.(next, name, values)
      }} />
  }
)
DecimalCurrencyInput.displayName = "TamirDecimalCurrencyInput"
export default DecimalCurrencyInput

export const LegacyDecimalInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(
  ({ onChange, value, defaultValue, ...props }, ref) =>
    <DecimalCurrencyInput {...props as any} ref={ref} customInput={Input}
      type="text" value={value as string | number} defaultValue={defaultValue as string | number}
      decimalsLimit={4}
      onValueChange={next => onChange?.({ target: { value: next ?? "" },
        currentTarget: { value: next ?? "" } } as any)} />
)
LegacyDecimalInput.displayName = "TamirLegacyDecimalInput"
