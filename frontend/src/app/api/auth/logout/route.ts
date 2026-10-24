import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth/session"

/**
 * Выход покупателя (H4). Medusa выдаёт stateless JWT — на сервере его негде
 * отзывать (нет таблицы сессий), поэтому единственный носитель токена —
 * httpOnly-кука. Снимаем куку: браузер сразу возвращается в анонимный режим,
 * а украденный ранее токен доживает только до своего `exp` в самом JWT.
 */
export const dynamic = "force-dynamic"

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
  clearSessionCookie(response)
  return response
}
