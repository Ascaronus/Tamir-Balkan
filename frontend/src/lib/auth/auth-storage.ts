const AUTH_TOKEN_KEY = "tb_customer_token"

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

export function clearAuthToken() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    // ignore
  }
}

