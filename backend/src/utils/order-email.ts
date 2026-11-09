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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!))
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
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("Order email: invalid quantity")
    if (typeof item.title !== "string" || !item.title.trim()) throw new Error("Order email: incomplete item")
    return {
      title: item.title,
      variant: item.variant_title && item.variant_title !== "Default variant" ? item.variant_title : "",
      quantity: item.quantity,
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
    html: `<!doctype html>
<html lang="sr-Latn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TAMIR — Order #${order.display_id}</title></head>
<body style="margin:0;padding:0;background:#f7f5f1;color:#29251f;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Porudžbina / Order #${order.display_id} · ${units} kom. / units · ${escapeHtml(total)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f5f1"><tr><td align="center" style="padding:24px 12px">
    <!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;text-align:left;background:#ffffff;border:1px solid #e7e2da;border-radius:12px">
      <tr><td style="padding:28px 24px;background:#29251f;color:#ffffff;border-radius:12px 12px 0 0">
        <a href="https://tamir.rs" style="color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:30px;letter-spacing:5px">TAMIR</a>
        <div style="margin-top:12px;font-size:11px;letter-spacing:1px;line-height:18px">POTVRDA PORUDŽBINE / ORDER CONFIRMATION</div>
      </td></tr>
      <tr><td style="padding:28px 24px 12px">
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
      <tr><td style="padding:20px 24px;background:#f0ede7;border-radius:0 0 12px 12px;font-size:12px;line-height:20px;color:#6e665e">Ovo je potvrda prijema porudžbine, a ne potvrda uplate.<br><span lang="en">This confirms receipt of your order, not receipt of payment.</span></td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
    <p style="margin:20px 0 0;font-size:12px;color:#6e665e"><a href="https://tamir.rs" style="color:#6e665e;text-decoration:underline">tamir.rs</a></p>
  </td></tr></table>
</body></html>`,
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
