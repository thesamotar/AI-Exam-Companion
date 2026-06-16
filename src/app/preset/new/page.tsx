'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  ArrowLeft,
  Clock,
  HelpCircle,
  AlertTriangle,
  Play,
  Loader2,
  CheckCircle2
} from 'lucide-react'
import {
  getSources,
  getWeakTopics,
  saveQuiz,
  isSandboxMode,
  ContentSource
} from '@/utils/db'

// Force client-side hydration for search params in App Router
function PresetNewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sourceIdParam = searchParams.get('source')

  const [sources, setSources] = useState<ContentSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const [length, setLength] = useState<'SHORT' | 'MEDIUM' | 'HOUR'>('SHORT')
  const [loading, setLoading] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [rateLimit, setRateLimit] = useState(false)

  const progressMessages = [
    'Retrieving exam content source metadata...',
    'Analyzing cumulative history & identifying weak topics...',
    'Constructing adaptive generation instructions (~40% weak-topic bias)...',
    'Calling Gemini 3.5 Flash API (generating questions)...',
    'Validating LaTeX stems and formatting answer schema...',
    'Securing answer key and saving quiz session...'
  ]

  const progressStep = Math.min(
    Math.floor((progressPercent / 100) * progressMessages.length),
    progressMessages.length - 1
  )

  useEffect(() => {
    async function loadSources() {
      try {
        const list = await getSources()
        const readySources = list.filter(s => s.status === 'ready')
        setSources(readySources)

        if (sourceIdParam) {
          setSelectedSourceId(sourceIdParam)
        } else if (readySources.length > 0) {
          setSelectedSourceId(readySources[0].id)
        }
      } catch (err) {
        console.error('Failed to load study sources:', err)
      }
    }
    loadSources()
  }, [sourceIdParam])

  // Progress percent simulator (caps at 95% during loading)
  useEffect(() => {
    if (!loading) {
      setProgressPercent(0)
      return
    }

    const interval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev < 95) {
          const step = prev < 40 ? 5 : prev < 75 ? 2 : 1
          return Math.min(prev + step, 95)
        }
        return prev
      })
    }, 150)

    return () => clearInterval(interval)
  }, [loading])

  const handleGenerate = async () => {
    if (!selectedSourceId) {
      setError('Please select an exam source.')
      return
    }

    setLoading(true)
    setError(null)
    setRateLimit(false)

    try {
      const selectedSource = sources.find(s => s.id === selectedSourceId)
      if (!selectedSource) throw new Error('Selected source not found')

      const sandbox = isSandboxMode()
      let weakTopics: string[] = []
      if (sandbox) {
        weakTopics = await getWeakTopics(selectedSourceId)
      }

      // 1. Post to API
      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source_id: selectedSourceId,
          length,
          sandbox_source: sandbox ? selectedSource : undefined,
          sandbox_weak_topics: sandbox ? weakTopics : undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 503 || data.code === '429') {
          setRateLimit(true)
          throw new Error('Gemini API quota exceeded or rate limited. Please try again in a moment.')
        }
        throw new Error(data.error || 'Failed to generate quiz')
      }

      const { quiz_id, questions, full_questions_for_sandbox } = data

      // Set to 100% and hold briefly before redirecting
      setProgressPercent(100)
      await new Promise((resolve) => setTimeout(resolve, 500))

      // 2. Persist locally if sandbox mode
      if (sandbox && full_questions_for_sandbox) {
        await saveQuiz({
          source_id: selectedSourceId,
          length,
          questions: full_questions_for_sandbox
        })
        // Direct route to quiz taking screen
        router.push(`/quiz/${quiz_id}`)
      } else {
        // Cloud route to quiz taking screen
        router.push(`/quiz/${quiz_id}`)
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred during quiz generation')
      setLoading(false)
    } finally {
      // Keep loading screen active until transition is finished
    }
  }

  const selectedSource = sources.find(s => s.id === selectedSourceId)

  return (
    <div className="relative min-h-screen bg-slate-950 text-white pb-16">
      {/* Background blobs */}
      <div className="absolute top-0 left-0 w-[50%] h-[40%] rounded-full bg-violet-900/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[40%] rounded-full bg-cyan-950/10 blur-[130px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <span className="font-bold text-sm bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Quiz Setup
            </span>
          </div>
        </div>
      </header>

      {/* Form Card */}
      <main className="max-w-xl mx-auto px-4 mt-12">
        <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-900 backdrop-blur-xl shadow-2xl space-y-8">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Configure Quiz
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Select your exam blueprint source and desired quiz duration to begin.
            </p>
          </div>

          {error && (
            <div className={`p-4 rounded-xl flex gap-3 text-sm ${
              rateLimit ? 'bg-amber-950/20 border border-amber-500/20 text-amber-300' : 'bg-red-950/20 border border-red-500/20 text-red-300'
            }`}>
              {rateLimit ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <div>
                <span className="font-bold block mb-1">{rateLimit ? 'Rate Limit Reached' : 'Generation Error'}</span>
                <span>{error}</span>
                {rateLimit && (
                  <button
                    onClick={handleGenerate}
                    className="mt-3 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-semibold block transition-all"
                  >
                    Retry Now
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 rounded-2xl bg-slate-950/60 border border-slate-900/80 animate-in fade-in duration-300">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <div className="space-y-1.5">
                <p className="font-bold text-slate-200">Generating Exam Paper ({progressPercent}%)</p>
                <p className="text-xs text-violet-400 font-medium animate-pulse">
                  {progressMessages[progressStep]}
                </p>
              </div>
              <div className="w-full max-w-xs bg-slate-900 h-1 rounded-full overflow-hidden border border-slate-950 mt-2">
                <div
                  className="bg-gradient-to-r from-violet-600 to-cyan-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 max-w-xs">
                This takes about 3 to 8 seconds. Gemini is preparing full-fidelity questions with solutions.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Select Source */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Content / Exam Source
                </label>
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-violet-500 outline-none transition-all"
                >
                  {sources.length === 0 ? (
                    <option value="" disabled>No exam sources ready</option>
                  ) : (
                    sources.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.exam_name} ({s.type === 'preset_exam' ? 'Preset' : 'Custom Upload'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Select Length */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Quiz Length &amp; Duration
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Short */}
                  <button
                    onClick={() => setLength('SHORT')}
                    className={`p-4 rounded-xl border flex flex-col text-left transition-all ${
                      length === 'SHORT'
                        ? 'border-violet-500 bg-violet-600/10 text-white shadow-lg shadow-violet-600/5'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="font-bold text-sm text-slate-200">Short Quiz</span>
                    <span className="text-xl font-extrabold text-white mt-2">5 Qs</span>
                    <span className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 10 mins
                    </span>
                  </button>

                  {/* Medium */}
                  <button
                    onClick={() => setLength('MEDIUM')}
                    className={`p-4 rounded-xl border flex flex-col text-left transition-all ${
                      length === 'MEDIUM'
                        ? 'border-violet-500 bg-violet-600/10 text-white shadow-lg shadow-violet-600/5'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="font-bold text-sm text-slate-200">Medium Quiz</span>
                    <span className="text-xl font-extrabold text-white mt-2">15 Qs</span>
                    <span className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 30 mins
                    </span>
                  </button>

                  {/* Hour */}
                  <button
                    onClick={() => setLength('HOUR')}
                    className={`p-4 rounded-xl border flex flex-col text-left transition-all ${
                      length === 'HOUR'
                        ? 'border-violet-500 bg-violet-600/10 text-white shadow-lg shadow-violet-600/5'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="font-bold text-sm text-slate-200">Hour Quiz</span>
                    <span className="text-xl font-extrabold text-white mt-2">30 Qs</span>
                    <span className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 60 mins
                    </span>
                  </button>
                </div>
              </div>

              {/* Info Text */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-900/60 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Questions are dynamically compiled based on the blueprint frequency of topics.
                  {selectedSource?.type === 'preset_exam'
                    ? ` Gemini 3.1 Flash will create new variations matching official ${selectedSource?.exam_name} patterns.`
                    : ` Gemini 3.1 Flash will synthesize questions matching files in the ${selectedSource?.exam_name} source blueprint.`}
                </p>
              </div>

              {/* Submit Action */}
              <button
                onClick={handleGenerate}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold transition-all shadow-lg shadow-violet-600/15 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
              >
                <Play className="w-5 h-5 fill-current" /> Launch Adaptive Session
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function PresetNewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm tracking-wide">Loading setup params...</p>
      </div>
    }>
      <PresetNewContent />
    </Suspense>
  )
}
