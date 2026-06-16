import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn('Supabase environment variables are missing! Authentication and database features will be disabled.')
    }
    // Return a safe proxy that returns dummy methods to avoid undefined crashes
    return new Proxy({} as any, {
      get: (target, prop) => {
        if (prop === 'auth') {
          return new Proxy({} as any, {
            get: () => () => Promise.resolve({ data: { user: null, session: null }, error: null })
          })
        }
        return () => Promise.resolve({ data: null, error: null })
      }
    })
  }

  return createBrowserClient(url, anonKey)
}
