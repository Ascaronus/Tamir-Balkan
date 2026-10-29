import nodemailer from "nodemailer"
import { mailConfig } from "./registration-email"

export type ReceiptOrder = {
  id: string
  display_id: number
  email: string
  currency_code: string
  total: number
  shipping_total: number
  items: { title: string; variant_title?: string | null; quantity: number; unit_price: number; total: number }[]
}

// Read Medusa's calculated totals; amounts are already in major currency units.
export function orderMessage(order: ReceiptOrder) {
  const money = (value: number) => {
    if (value == null || !Number.isFinite(Number(value))) throw new Error("Order email: missing amount")
    return new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: order.currency_code.toUpperCase() }).format(Number(value))
  }
  if (!order.display_id || !order.items?.length) throw new Error("Order email: incomplete order")
  const lines = order.items.map(item => [
    `${item.title}${item.variant_title && item.variant_title !== "Default variant" ? ` — ${item.variant_title}` : ""}`,
    `Količina / Quantity: ${item.quantity} × ${money(item.unit_price)}`,
    `Ukupno za stavku / Line total: ${money(item.total)}`,
  ].join("\n"))
  return {
    subject: `TAMIR — Porudžbina / Order #${order.display_id}`,
    text: [
      `Hvala na kupovini! Primili smo vašu porudžbinu #${order.display_id}.`,
      `Thank you for shopping with us! We received your order #${order.display_id}.`,
      "Proizvodi / Items", ...lines,
      `Dostava / Shipping: ${money(order.shipping_total)}`,
      `Ukupno / Total: ${money(order.total)}`,
      "Ovo je potvrda prijema porudžbine, a ne potvrda uplate.",
      "This confirms receipt of your order, not receipt of payment.",
      "TAMIR\nhttps://tamir.rs",
    ].join("\n\n"),
  }
}

export async function sendOrderEmail(order: ReceiptOrder) {
  const message = orderMessage(order)
  const config = mailConfig()
  const transport = nodemailer.createTransport(config)
  try {
    const result = await transport.sendMail({
      from: { name: "TAMIR", address: config.auth.user },
      to: { address: order.email, name: "" },
      ...message,
      messageId: `<order-confirmation.${order.id}@tamir.rs>`,
      disableFileAccess: true, disableUrlAccess: true,
    })
    if (!result.accepted.length) throw new Error("Not accepted")
  } catch {
    throw new Error("Order email was not accepted by SMTP. Check credentials and server connectivity.")
  } finally { transport.close() }
}
