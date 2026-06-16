'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  BookOpen,
  FileUp,
  History,
  TrendingDown,
  LogOut,
  Plus,
  ShieldCheck,
  CheckCircle,
  HelpCircle,
  Clock,
  Loader2,
  AlertCircle,
  SlidersHorizontal
} from 'lucide-react'
import {
  getSources,
  getAttempts,
  getCumulativeStats,
  saveSource,
  isSandboxMode,
  ContentSource,
  Attempt
} from '@/utils/db'
import { createClient } from '@/utils/supabase/client'

// Guard to prevent concurrent/Strict Mode duplicate inserts
let isProvisioningDefaultPresets = false

export default function DashboardPage() {
  const router = useRouter()
  const [sources, setSources] = useState<ContentSource[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [stats, setStats] = useState({ accuracy: 0, totalAttempts: 0, weakTopics: [] as string[] })
  const [loading, setLoading] = useState(true)
  const [sandbox, setSandbox] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Filters State
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>('ALL')
  const [selectedScoreFilter, setSelectedScoreFilter] = useState<string>('ALL')
  const [selectedLengthFilter, setSelectedLengthFilter] = useState<string>('ALL')

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const isSandbox = isSandboxMode()
        setSandbox(isSandbox)

        let email = 'guest@examcompanion.ai'
        if (!isSandbox) {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            email = user.email || email
          }
        } else {
          const stored = localStorage.getItem('ai_exam_sandbox_user')
          if (stored) {
            try {
              email = JSON.parse(stored).email || email
            } catch {
              // Ignore
            }
          }
        }
        setUserEmail(email)

        // Fetch sources
        let sourcesList = await getSources()

        // Auto-provision default presets if they are missing (onboarding usability)
        const defaultNames = ['JEE', 'NEET', 'CAT', 'SAT', 'GMAT', 'GRE']
        const missingNames = defaultNames.filter(name => !sourcesList.some(s => s.type === 'preset_exam' && s.exam_name === name))

        if (missingNames.length > 0 && !isProvisioningDefaultPresets) {
          isProvisioningDefaultPresets = true
          try {
            const defaultsToSave = missingNames.map(name => ({
              type: 'preset_exam' as const,
              exam_name: name,
              status: 'ready' as const
            }))
            for (const item of defaultsToSave) {
              await saveSource(item)
            }
            sourcesList = await getSources()
          } catch (e) {
            console.error('Failed to auto-provision defaults:', e)
          } finally {
            isProvisioningDefaultPresets = false
          }
        }

        setSources(sourcesList)

        // Fetch attempts and stats
        const attemptsList = await getAttempts()
        setAttempts(attemptsList)

        const cumulativeStats = await getCumulativeStats()
        setStats(cumulativeStats)

      } catch (err: any) {
        console.error('Failed to load dashboard:', err)
        setErrorMsg('Could not connect to database. Check database status or .env.local configuration.')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  const handleLogout = async () => {
    if (isSandboxMode()) {
      localStorage.removeItem('ai_exam_sandbox_user')
      document.cookie = 'ai_exam_sandbox_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      router.push('/login')
      router.refresh()
      return
    }

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Poll for analyzing sources if there are any
  useEffect(() => {
    const activeAnalyzing = sources.some(s => s.status === 'analyzing')
    if (!activeAnalyzing) return

    const interval = setInterval(async () => {
      try {
        const freshSources = await getSources()
        setSources(freshSources)
      } catch (err) {
        console.error('Error polling sources:', err)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [sources])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm tracking-wide">Initializing your dashboard...</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white pb-16">
      {/* Background radial highlights */}
      <div className="absolute top-0 right-0 w-[50%] h-[40%] rounded-full bg-violet-900/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[50%] h-[40%] rounded-full bg-cyan-950/10 blur-[130px] pointer-events-none" />

      {/* Navbar Header */}
      <header className="border-b border-slate-950 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/10">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              AI Exam Companion
            </span>
          </div>

          <div className="flex items-center gap-4">
            {sandbox ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25">
                <ShieldCheck className="w-3.5 h-3.5" /> Sandbox Mode
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <ShieldCheck className="w-3.5 h-3.5" /> Cloud Connected
              </span>
            )}

            <div className="text-right hidden md:block">
              <p className="text-xs text-slate-500">Logged in as</p>
              <p className="text-sm font-medium text-slate-300">{userEmail}</p>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-all"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Stats Grid Overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Accuracy Card */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 backdrop-blur-md flex items-center gap-5">
            <div className="relative flex items-center justify-center w-16 h-16 shrink-0 rounded-2xl bg-violet-600/10 border border-violet-500/20">
              <span className="text-xl font-extrabold text-violet-400">{stats.accuracy}%</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-400">Cumulative Accuracy</h3>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.totalAttempts > 0 ? `${stats.accuracy}% Correct` : 'N/A'}
              </p>
              <div className="w-full bg-slate-950 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-900">
                <div
                  className="bg-gradient-to-r from-violet-600 to-cyan-500 h-1.5 rounded-full"
                  style={{ width: `${stats.accuracy}%` }}
                />
              </div>
            </div>
          </div>

          {/* Attempts Card */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 backdrop-blur-md flex items-center gap-5">
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
              <History className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-400">Quizzes Attempted</h3>
              <p className="text-3xl font-extrabold text-white mt-1">{stats.totalAttempts}</p>
              <p className="text-xs text-slate-500 mt-1">Across all content sources</p>
            </div>
          </div>

          {/* Weak Topics Card */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 backdrop-blur-md flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-slate-400">Weak Topics Focus</h3>
            </div>
            {stats.weakTopics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {stats.weakTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-300"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No weak topics detected (accuracy &ge; 60%). Keep practicing!</p>
            )}
          </div>
        </section>

        {/* Action Panel: Build / Upload Quiz Sources */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Preset Quiz Launcher */}
          <div className="p-8 rounded-2xl bg-slate-900/30 border border-slate-900 backdrop-blur-md hover:border-violet-500/15 transition-all flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <BookOpen className="w-6 h-6 text-violet-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Standard Preset Exams</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Start a quiz modeled after standard entrance papers like <strong className="text-slate-300 font-semibold">JEE</strong>, <strong className="text-slate-300 font-semibold">NEET</strong>, <strong className="text-slate-300 font-semibold">CAT</strong>, <strong className="text-slate-300 font-semibold">SAT</strong>, <strong className="text-slate-300 font-semibold">GMAT</strong>, or <strong className="text-slate-300 font-semibold">GRE</strong>. Generates adaptive questions instantly from Gemini's internal blueprints.
              </p>
            </div>
            <Link
              href="/preset/new"
              className="py-3 px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-violet-600/20"
            >
              <Plus className="w-5 h-5" /> Generate Preset Quiz
            </Link>
          </div>

          {/* Custom File Upload Launcher */}
          <div className="p-8 rounded-2xl bg-slate-900/30 border border-slate-900 backdrop-blur-md hover:border-cyan-500/15 transition-all flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-xl bg-cyan-600/15 border border-cyan-500/20 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <FileUp className="w-6 h-6 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Upload Question Papers</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Upload 1 or more PDF exam papers to define a custom content source. Uploading <strong className="text-slate-300 font-semibold">3 or more PDFs</strong> unlocks LLM-based <strong className="text-slate-300 font-semibold">trend forecasting</strong> and pattern analysis. PDFs are read exactly once.
              </p>
            </div>
            <Link
              href="/custom/new"
              className="py-3 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-600/20"
            >
              <FileUp className="w-5 h-5" /> Analyze Custom Papers
            </Link>
          </div>
        </section>

        {/* Sources section (Full Width, horizontal layout) */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-slate-300">My Study Sources</h3>
          {sources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sources.map((source) => {
                const isPreset = source.type === 'preset_exam'
                return (
                  <div
                    key={source.id}
                    className="p-5 rounded-2xl bg-slate-900/30 border border-slate-900 hover:border-violet-500/15 backdrop-blur-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <h4 className="font-extrabold text-lg text-slate-100">{source.exam_name}</h4>
                      <p className="text-xs text-slate-400 mt-1 capitalize leading-relaxed">
                        {isPreset ? 'Standard Preset' : `Uploaded PDFs (${source.mode_flag || 'similar'} mode)`}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                      <div>
                        {source.status === 'analyzing' ? (
                          <span className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse font-bold uppercase tracking-wider">
                            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                          </span>
                        ) : source.status === 'error' ? (
                          <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-bold uppercase tracking-wider">
                            Error
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-wider">
                            Ready
                          </span>
                        )}
                      </div>

                      {source.status === 'ready' && (
                        <Link
                          href={`/preset/new?source=${source.id}`}
                          className="text-xs text-violet-400 hover:text-violet-300 font-bold flex items-center gap-1 hover:translate-x-0.5 transition-transform"
                        >
                          Start Quiz &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-900/10">
              <HelpCircle className="w-8 h-8 text-slate-600 mb-3" />
              <p className="text-slate-400 font-medium">No study sources yet</p>
              <p className="text-xs text-slate-600 mt-1">Select standard preset exams above or upload your own question papers.</p>
            </div>
          )}
        </section>

        {/* Attempts History Section (Full Width, below sources) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-slate-300">Recent Quiz Attempts</h3>
            
            {/* Filter controls */}
            {attempts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <div className="flex items-center gap-1 text-slate-500 mr-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Filter By:</span>
                </div>

                {/* Exam filter */}
                <select
                  value={selectedExamFilter}
                  onChange={(e) => setSelectedExamFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-semibold"
                >
                  <option value="ALL">All Exams</option>
                  {Array.from(new Set(sources.map(s => s.exam_name))).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>

                {/* Length filter */}
                <select
                  value={selectedLengthFilter}
                  onChange={(e) => setSelectedLengthFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-semibold"
                >
                  <option value="ALL">All Durations</option>
                  <option value="SHORT">Short (5 Qs)</option>
                  <option value="MEDIUM">Medium (10 Qs)</option>
                  <option value="HOUR">Hour (30 Qs)</option>
                </select>

                {/* Score filter */}
                <select
                  value={selectedScoreFilter}
                  onChange={(e) => setSelectedScoreFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-semibold"
                >
                  <option value="ALL">All Scores</option>
                  <option value="HIGH">High (≥ 75%)</option>
                  <option value="AVERAGE">Average (50% - 74%)</option>
                  <option value="LOW">Low (&lt; 50%)</option>
                </select>
              </div>
            )}
          </div>

          {attempts.length > 0 ? (
            (() => {
              const filteredAttempts = attempts.filter(attempt => {
                if (selectedExamFilter !== 'ALL') {
                  const sourceName = attempt.content_source?.exam_name || 'Custom Exam'
                  if (sourceName !== selectedExamFilter) return false
                }
                if (selectedLengthFilter !== 'ALL') {
                  const len = attempt.quiz?.length || 'SHORT'
                  if (len !== selectedLengthFilter) return false
                }
                if (selectedScoreFilter !== 'ALL') {
                  const scorePct = Math.round(Number(attempt.score) * 100)
                  if (selectedScoreFilter === 'HIGH' && scorePct < 75) return false
                  if (selectedScoreFilter === 'AVERAGE' && (scorePct < 50 || scorePct >= 75)) return false
                  if (selectedScoreFilter === 'LOW' && scorePct >= 50) return false
                }
                return true
              })

              return filteredAttempts.length > 0 ? (
                <div className="border border-slate-900 rounded-xl overflow-hidden bg-slate-900/20">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider font-bold">
                          <th className="px-6 py-3">Date</th>
                          <th className="px-6 py-3">Exam Paper</th>
                          <th className="px-6 py-3">Length</th>
                          <th className="px-6 py-3 text-center">Score</th>
                          <th className="px-6 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/80">
                        {filteredAttempts.map((attempt) => {
                          const scorePct = Math.round(Number(attempt.score) * 100)
                          return (
                            <tr key={attempt.id} className="hover:bg-slate-900/30 transition-colors">
                              <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                                {new Date(attempt.submitted_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="px-6 py-4 font-semibold text-slate-200">
                                {attempt.content_source?.exam_name || 'Custom Exam'}
                              </td>
                              <td className="px-6 py-4 text-slate-400">
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <Clock className="w-3.5 h-3.5" /> {attempt.quiz?.length || 'SHORT'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    scorePct >= 75
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : scorePct >= 50
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}
                                >
                                  {scorePct}%
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Link
                                  href={`/quiz/${attempt.id}/results`}
                                  className="text-xs text-violet-400 hover:text-violet-300 font-semibold"
                                >
                                  Review &rarr;
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-900/10">
                  <SlidersHorizontal className="w-8 h-8 text-slate-700 mb-3" />
                  <p className="text-slate-400 font-medium">No results match your filters</p>
                  <p className="text-xs text-slate-600 mt-1">Try resetting or changing the filters to show attempts.</p>
                </div>
              )
            })()
          ) : (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-900/10">
              <HelpCircle className="w-8 h-8 text-slate-600 mb-3" />
              <p className="text-slate-400 font-medium">No quiz attempts yet</p>
              <p className="text-xs text-slate-600 mt-1">Select an exam mode above to generate your first quiz paper.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
