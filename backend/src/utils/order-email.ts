import nodemailer from "nodemailer"
import { emailLayout, escapeHtml } from "./email-layout"
import { BigNumber } from "@medusajs/framework/utils"
import { mailConfig } from "./registration-email"

export type ReceiptOrder = {
  id: string
  display_id: number
  email: string
  currency_code: string
  total: number
  shipping_total: number
  items: { title: string; variant_title?: string | null; quantity: number | BigNumber; unit_price: number; total: number }[]
}

// Read Medusa's calculated totals, including discounts/taxes; never rebuild them
// from unit_price * quantity. Amounts are already in major currency units.
export function orderMessage(order: ReceiptOrder) {
  const money = (value: number) => {
    if (value == null || typeof value === "boolean" || String(value).trim() === "" || !Number.isFinite(Number(value))) throw new Error("Order email: missing amount")
    return new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: order.currency_code.toUpperCase() }).format(Number(value))
  }
  if (!Number.isSafeInteger(order.display_id) || order.display_id < 1 || !order.items?.length) throw new Error("Order email: incomplete order")
  const items = order.items.map(item => {
    // Graph results retain Medusa BigNumber values until HTTP JSON serialization.
    const quantity = item.quantity instanceof BigNumber ? item.quantity.numeric : item.quantity
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Order email: invalid quantity")
    if (typeof item.title !== "string" || !item.title.trim()) throw new Error("Order email: incomplete item")
    return {
      title: item.title,
      variant: item.variant_title && item.variant_title !== "Default variant" ? item.variant_title : "",
      quantity,
      unit: money(item.unit_price),
      total: money(item.total),
    }
  })
  const units = items.reduce((sum, item) => sum + item.quantity, 0)
  const shipping = money(order.shipping_total), total = money(order.total)
  const lines = items.map((item, index) => [
    `${index + 1}. ${item.title}${item.variant ? ` — ${item.variant}` : ""}`,
    `Količina / Quantity: ${item.quantity} × ${item.unit}`,
    `Ukupno za stavku / Line total: ${item.total}`,
  ].join("\n"))
  const rows = items.map(item => `<tr>
    <td style="padding:20px 0;border-bottom:1px solid #e7e2da;vertical-align:top;word-break:break-word">
      <strong style="font-size:15px;line-height:22px">${escapeHtml(item.title)}</strong>
      ${item.variant ? `<div style="margin-top:4px;color:#6e665e;font-size:13px">${escapeHtml(item.variant)}</div>` : ""}
      <div style="margin-top:10px;font-size:13px;color:#6e665e">Količina / Quantity: <strong style="color:#29251f">${item.quantity}</strong></div>
      <div style="margin-top:4px;font-size:13px;color:#6e665e">Cena / Unit price: ${escapeHtml(item.unit)}</div>
    </td>
    <td align="right" style="width:35%;padding:20px 0 20px 12px;border-bottom:1px solid #e7e2da;vertical-align:top;font-size:15px;font-weight:700;line-height:22px">${escapeHtml(item.total)}</td>
  </tr>`).join("")
  return {
    subject: `TAMIR — Porudžbina / Order #${order.display_id}`,
    text: [
      "TAMIR — POTVRDA PORUDŽBINE / ORDER CONFIRMATION",
      `Hvala na kupovini! Primili smo vašu porudžbinu #${order.display_id}.`,
      `Thank you for shopping with us! We received your order #${order.display_id}.`,
      `Proizvodi / Items\nStavke / Lines: ${items.length} · Komada / Units: ${units}`,
      ...lines,
      `Dostava / Shipping: ${shipping}\nUkupno / Total: ${total}`,
      "Ovo je potvrda prijema porudžbine, a ne potvrda uplate.\nThis confirms receipt of your order, not receipt of payment.",
      "TAMIR\nhttps://tamir.rs",
    ].join("\n\n"),
    html: emailLayout({
      title: `TAMIR — Order #${order.display_id}`,
      preview: `Porudžbina / Order #${order.display_id} · ${units} kom. / units · ${total}`,
      label: "POTVRDA PORUDŽBINE / ORDER CONFIRMATION",
      content: `      <tr><td style="padding:28px 24px 12px">
        <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:34px">Hvala na kupovini!</h1>
        <p style="margin:0;font-size:15px;line-height:24px">Primili smo vašu porudžbinu <strong>#${order.display_id}</strong>.</p>
        <p lang="en" style="margin:6px 0 22px;color:#6e665e;font-size:13px;line-height:21px">Thank you for shopping with us! We received your order <strong>#${order.display_id}</strong>.</p>
        <h2 style="margin:0 0 6px;font-size:17px;line-height:24px">Proizvodi / Items</h2>
        <p style="margin:0;color:#6e665e;font-size:13px;line-height:21px">Stavke / Lines: ${items.length} &nbsp;·&nbsp; Komada / Units: ${units}</p>
        <table width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;border-collapse:collapse;margin-top:16px">
          <thead><tr><th align="left" scope="col" style="padding:0 0 8px;font-size:11px;font-weight:400;color:#6e665e">PROIZVOD / PRODUCT</th><th align="right" scope="col" style="width:35%;padding:0 0 8px;font-size:11px;font-weight:400;color:#6e665e">IZNOS / LINE TOTAL</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </td></tr>
      <tr><td style="padding:12px 24px 28px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr><td style="padding:10px 0;font-size:14px">Dostava / Shipping</td><td align="right" style="padding:10px 0;font-size:14px">${escapeHtml(shipping)}</td></tr>
          <tr><td style="padding:16px 0;border-top:1px solid #e7e2da;font-size:18px;font-weight:700">Ukupno / Total</td><td align="right" style="padding:16px 0;border-top:1px solid #e7e2da;font-size:20px;font-weight:700">${escapeHtml(total)}</td></tr>
        </table>
      </td></tr>
`,
      footer: { sr: "Ovo je potvrda prijema porudžbine, a ne potvrda uplate.", en: "This confirms receipt of your order, not receipt of payment." },
    }),
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
