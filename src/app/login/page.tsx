'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { LogIn, UserPlus, AlertCircle, ShieldAlert, Sparkles } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isSandbox, setIsSandbox] = useState(false)

  useEffect(() => {
    // Check if Supabase keys are missing
    const hasKeys =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    setIsSandbox(!hasKeys)
  }, [])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    if (isRegister && password !== confirmPassword) {
      setErrorMsg('Passwords do not match')
      setLoading(false)
      return
    }

    if (isSandbox) {
      // Demo Sandbox Login
      // Set a mock user flag in localStorage to pretend we are logged in
      localStorage.setItem('ai_exam_sandbox_user', JSON.stringify({ email: email || 'demo@examcompanion.ai', isDemo: true }))
      // Set a cookie so the server knows we're in sandbox if needed
      document.cookie = 'ai_exam_sandbox_session=true; path=/; max-age=86400'
      setSuccessMsg('Successfully logged into Sandbox Mode!')
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 1000)
      setLoading(false)
      return
    }

    const supabase = createClient()
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        if (data.user && !data.session) {
          setSuccessMsg('Registration successful! Please check your email for the confirmation link.')
        } else {
          setSuccessMsg('Registration successful!')
          setTimeout(() => {
            router.push('/')
            router.refresh()
          }, 1000)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        setSuccessMsg('Logged in successfully!')
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 1000)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication')
    } finally {
      setLoading(false)
    }
  }

  const handleSandboxBypass = () => {
    localStorage.setItem('ai_exam_sandbox_user', JSON.stringify({ email: 'guest@examcompanion.ai', isDemo: true }))
    document.cookie = 'ai_exam_sandbox_session=true; path=/; max-age=86400'
    router.push('/')
    router.refresh()
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-white overflow-hidden transition-all duration-500">
      {/* Dynamic Background Gradients */}
      {isRegister ? (
        <>
          <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-fuchsia-950/20 blur-[120px] pointer-events-none transition-all duration-500" />
          <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none transition-all duration-500" />
        </>
      ) : (
        <>
          <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/20 blur-[120px] pointer-events-none transition-all duration-500" />
          <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-cyan-950/20 blur-[120px] pointer-events-none transition-all duration-500" />
        </>
      )}

      {/* Auth Card Container */}
      <div className={`w-full max-w-md p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-2xl transition-all duration-500 ${
        isRegister ? 'hover:border-fuchsia-500/20' : 'hover:border-violet-500/20'
      }`}>
        <div className="flex flex-col items-center mb-8">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4 animate-pulse transition-all duration-500 ${
            isRegister 
              ? 'bg-gradient-to-tr from-fuchsia-600 to-indigo-500 shadow-fuchsia-500/20' 
              : 'bg-gradient-to-tr from-violet-600 to-cyan-500 shadow-violet-500/20'
          }`}>
            {isRegister ? (
              <UserPlus className="w-8 h-8 text-white" />
            ) : (
              <Sparkles className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            {isRegister ? 'Create Your Account' : 'AI Exam Companion'}
          </h1>
          <p className="text-sm text-slate-400 mt-2 text-center transition-all duration-500">
            {isRegister 
              ? 'Unlock personalized analytics and AI tutoring' 
              : isSandbox 
              ? 'Local Sandbox Demo Environment' 
              : 'Your adaptive exam preparation portal'}
          </p>
        </div>

        {isSandbox && (
          <div className="mb-6 p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              <span className="font-semibold block mb-0.5">Sandbox Mode Active</span>
              Supabase configuration variables are not set. The app will save data locally in browser localStorage and mock endpoints. Click below to bypass immediately.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center gap-3 text-emerald-300 text-sm">
            <Sparkles className="w-5 h-5 shrink-0 animate-bounce" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. name@domain.com"
              className={`w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 outline-none focus:ring-1 transition-all ${
                isRegister ? 'focus:border-fuchsia-500 focus:ring-fuchsia-500' : 'focus:border-violet-500 focus:ring-violet-500'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 outline-none focus:ring-1 transition-all ${
                isRegister ? 'focus:border-fuchsia-500 focus:ring-fuchsia-500' : 'focus:border-violet-500 focus:ring-violet-500'
              }`}
            />
          </div>

          {isRegister && (
            <div className="animate-in fade-in duration-300">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition-all text-white placeholder-slate-600 outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-xl text-white font-semibold transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
              isRegister 
                ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 shadow-lg shadow-fuchsia-600/15' 
                : 'bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 shadow-lg shadow-violet-600/15'
            }`}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : isRegister ? (
              <>
                <UserPlus className="w-5 h-5" />
                Sign Up
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsRegister(!isRegister)
              setErrorMsg(null)
              setSuccessMsg(null)
              setConfirmPassword('')
            }}
            className={`text-sm transition-colors ${
              isRegister ? 'text-slate-400 hover:text-fuchsia-400' : 'text-slate-400 hover:text-violet-400'
            }`}
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

        {isSandbox && (
          <div className="relative mt-8 pt-6 border-t border-slate-800/80">
            <button
              onClick={handleSandboxBypass}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:bg-slate-900/60 hover:border-slate-700 text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              Enter Sandbox Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
