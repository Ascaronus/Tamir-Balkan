export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!))
}

// Shared table-based, inline-styled shell for all customer emails.
// content is trusted template HTML; escape all dynamic values before inserting it.
export function emailLayout({ title, preview, label, content, footer }: {
  title: string; preview: string; label: string; content: string;
  footer: { sr: string; en: string };
}) {
  return `<!doctype html>
<html lang="sr-Latn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f7f5f1;color:#29251f;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f5f1"><tr><td align="center" style="padding:24px 12px">
    <!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;text-align:left;background:#ffffff;border:1px solid #e7e2da;border-radius:12px">
      <tr><td style="padding:28px 24px;background:#29251f;color:#ffffff;border-radius:12px 12px 0 0">
        <a href="https://tamir.rs" style="color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:30px;letter-spacing:5px">TAMIR</a>
        <div style="margin-top:12px;font-size:11px;letter-spacing:1px;line-height:18px">${escapeHtml(label)}</div>
      </td></tr>
${content}
      <tr><td style="padding:20px 24px;background:#f0ede7;border-radius:0 0 12px 12px;font-size:12px;line-height:20px;color:#6e665e">${escapeHtml(footer.sr)}<br><span lang="en">${escapeHtml(footer.en)}</span></td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
    <p style="margin:20px 0 0;font-size:12px;color:#6e665e"><a href="https://tamir.rs" style="color:#6e665e;text-decoration:underline">tamir.rs</a></p>
  </td></tr></table>
</body></html>`
}
