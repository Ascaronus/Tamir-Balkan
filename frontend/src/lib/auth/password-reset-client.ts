import { sdk } from "@/lib/medusa"
import type { RegistrationChallenge } from "./auth-client"
export async function requestPasswordReset(email: string, captcha_token: string) {
  return sdk.client.fetch<RegistrationChallenge>("/store/password-reset/start", {
    method: "POST", body: { email: email.trim().toLowerCase(), captcha_token }, cache: "no-store",
  })
}
export async function resetPassword(params: { email: string; challenge_id: string; code: string; password: string }) {
  return sdk.client.fetch<{ success: boolean }>("/store/password-reset/verify", {
    method: "POST", body: { ...params, email: params.email.trim().toLowerCase() }, cache: "no-store",
  })
}
