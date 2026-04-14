"use client"

import type { HttpTypes } from "@medusajs/types"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  login as loginApi,
  logout as logoutApi,
  retrieveCustomer as retrieveCustomerApi,
  signup as signupApi,
} from "@/lib/auth/auth-client"
import { getAuthToken } from "@/lib/auth/auth-storage"

type AuthContextValue = {
  customer: HttpTypes.StoreCustomer | null
  isReady: boolean
  isMutating: boolean
  isLoggedIn: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (params: {
    email: string
    password: string
    first_name: string
    last_name: string
    phone: string
    notes?: string
    country_code: string
    city?: string
    postal_code: string
  }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<HttpTypes.StoreCustomer | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isMutating, setIsMutating] = useState(false)

  const refresh = useCallback(async () => {
    const next = await retrieveCustomerApi()
    setCustomer(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (getAuthToken()) {
          const next = await retrieveCustomerApi()
          if (!cancelled) setCustomer(next)
        }
      } finally {
        if (!cancelled) setIsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setIsMutating(true)
    try {
      await loginApi({ email, password })
      await refresh()
    } finally {
      setIsMutating(false)
    }
  }, [refresh])

  const signup = useCallback(async (params: {
    email: string
    password: string
    first_name: string
    last_name: string
    phone: string
    notes?: string
    country_code: string
    city?: string
    postal_code: string
  }) => {
    setIsMutating(true)
    try {
      await signupApi(params)
      await refresh()
    } finally {
      setIsMutating(false)
    }
  }, [refresh])

  const logout = useCallback(async () => {
    setIsMutating(true)
    try {
      await logoutApi()
      setCustomer(null)
    } finally {
      setIsMutating(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    customer,
    isReady,
    isMutating,
    isLoggedIn: Boolean(customer),
    refresh,
    login,
    signup,
    logout,
  }), [customer, isReady, isMutating, refresh, login, signup, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

