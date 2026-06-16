'use client'

import * as React from 'react'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Send,
  AlertTriangle,
  Loader2,
  CheckSquare,
  HelpCircle
} from 'lucide-react'
import { getQuizById, saveAttempt, isSandboxMode, Quiz } from '@/utils/db'
import MathRenderer from '@/components/MathRenderer'

interface QuizPageProps {
  params: Promise<{ id: string }>
}

export default function QuizPage({ params }: QuizPageProps) {
  const { id: quizId } = use(params)
  const router = useRouter()

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [timeLeft, setTimeLeft] = useState(600) // Default 10 mins
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sandbox, setSandbox] = useState(false)

  // Load quiz details
  useEffect(() => {
    async function fetchQuiz() {
      try {
        const quizObj = await getQuizById(quizId)
        if (!quizObj) {
          router.push('/')
          return
        }

        setQuiz(quizObj)
        setSandbox(isSandboxMode())

        // Set duration
        let durationMin = 10
        if (quizObj.length === 'MEDIUM') durationMin = 30
        if (quizObj.length === 'HOUR') durationMin = 60
        setTimeLeft(durationMin * 60)

        // Mark first question visited
        if (quizObj.questions.length > 0) {
          setVisited(new Set([quizObj.questions[0].id]))
        }
      } catch (err) {
        console.error('Failed to load quiz:', err)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }
    fetchQuiz()
  }, [quizId, router])

  // Count down timer
  useEffect(() => {
    if (loading || isSubmitting || !quiz) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Time expired -> trigger auto submit!
          handleAutoSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [loading, isSubmitting, quiz])

  const markVisited = (idx: number) => {
    if (!quiz) return
    const qId = quiz.questions[idx].id
    setVisited((prev) => {
      const next = new Set(prev)
      next.add(qId)
      return next
    })
    setActiveIdx(idx)
  }

  const handleSingleMcqSelect = (qId: string, optionKey: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [qId]: optionKey
    }))
  }

  const handleMultiMcqSelect = (qId: string, optionKey: string) => {
    setUserAnswers((prev) => {
      const current = prev[qId] || []
      const next = current.includes(optionKey)
        ? current.filter((k: string) => k !== optionKey)
        : [...current, optionKey]
      return {
        ...prev,
        [qId]: next
      }
    })
  }

  const handleTitaChange = (qId: string, value: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [qId]: value
    }))
  }

  const toggleFlag = (qId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(qId)) {
        next.delete(qId)
      } else {
        next.add(qId)
      }
      return next
    })
  }

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleAutoSubmit = () => {
    console.warn('Time limit reached. Submitting answers automatically.')
    submitQuizAnswers(true)
  }

  const submitQuizAnswers = async (force = false) => {
    if (!quiz || isSubmitting) return
    setIsSubmitting(true)
    setConfirmOpen(false)

    try {
      // Structure answers list for backend/grading
      const answersList = quiz.questions.map((q) => ({
        question_id: q.id,
        value: userAnswers[q.id] !== undefined ? userAnswers[q.id] : null
      }))

      let attemptId = ''

      if (sandbox) {
        // Local sandbox grading engine
        const graded = gradeLocalQuiz(quiz.questions, userAnswers)
        const saved = await saveAttempt(
          {
            quiz_id: quizId,
            source_id: quiz.source_id,
            score: graded.score
          },
          graded.items
        )
        attemptId = saved.id
      } else {
        // Cloud route handler submission
        const res = await fetch(`/api/quiz/${quizId}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ answers: answersList })
        })

        if (!res.ok) {
          throw new Error('Failed to submit quiz grading request')
        }

        const resultData = await res.json()
        attemptId = resultData.attempt_id
      }

      router.push(`/quiz/${attemptId}/results`)
    } catch (err) {
      console.error('Submission failed:', err)
      alert('Failed to submit answers. Please try again.')
      setIsSubmitting(false)
    }
  }

  const gradeLocalQuiz = (questions: any[], answers: Record<string, any>) => {
    const items = questions.map((q) => {
      const answer = answers[q.id]
      let isCorrect = false

      if (answer === null || answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0)) {
        isCorrect = false
      } else if (q.type === 'single_mcq') {
        isCorrect = answer === q.answer_key.correct_option
      } else if (q.type === 'multi_mcq') {
        const userSet = new Set(answer)
        const correctSet = new Set(q.answer_key.correct_options || [])
        isCorrect =
          userSet.size === correctSet.size &&
          [...userSet].every((k) => correctSet.has(k))
      } else if (q.type === 'numerical_tita') {
        const userVal = parseFloat(answer)
        const targetVal = q.answer_key.value
        const tol = q.answer_key.tolerance
        isCorrect = !isNaN(userVal) && Math.abs(userVal - targetVal) <= tol
      }

      return {
        question_id: q.id,
        topic: q.topic,
        user_answer: answer !== undefined ? answer : null,
        is_correct: isCorrect
      }
    })

    const score = items.filter((i) => i.is_correct).length / questions.length
    return { score, items }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm tracking-wide">Loading quiz session...</p>
      </div>
    )
  }

  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <AlertTriangle className="w-10 h-10 text-rose-500 mb-4" />
        <p className="text-slate-400 text-sm">Quiz is empty or invalid.</p>
        <Link href="/" className="mt-4 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold">
          Return Home
        </Link>
      </div>
    )
  }

  const currentQ = quiz.questions[activeIdx]
  const unansweredCount = quiz.questions.filter((q) => userAnswers[q.id] === undefined || userAnswers[q.id] === null || (Array.isArray(userAnswers[q.id]) && userAnswers[q.id].length === 0)).length
  const lowTime = timeLeft <= 60

  return (
    <div className="relative min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Quiz Top bar */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-200">Adaptive Session</h1>
            <p className="text-[10px] text-slate-500">Duration: {quiz.length}</p>
          </div>
        </div>

        {/* Timer display */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-sm font-semibold transition-all ${
            lowTime
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 animate-pulse scale-105'
              : 'bg-slate-900 border-slate-800 text-cyan-400'
          }`}>
            <Clock className={`w-4 h-4 ${lowTime ? 'text-rose-400' : 'text-cyan-400'}`} />
            {formatTime(timeLeft)}
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-violet-500/10"
          >
            <Send className="w-3.5 h-3.5" /> Submit Paper
          </button>
        </div>
      </header>

      {/* Main split grid layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
        {/* Left Side: Navigation Sidebar (Desktop only) */}
        <aside className="hidden lg:block lg:col-span-1 border-r border-slate-900/60 p-6 space-y-6 overflow-y-auto">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Questions Navigator
            </h3>
            <div className="grid grid-cols-4 gap-2.5">
              {quiz.questions.map((q, idx) => {
                const isCurrent = idx === activeIdx
                const isAnswered = userAnswers[q.id] !== undefined && userAnswers[q.id] !== null && (!Array.isArray(userAnswers[q.id]) || userAnswers[q.id].length > 0)
                const isFlagged = flagged.has(q.id)
                const isQVisited = visited.has(q.id)

                let buttonStyle = 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
                if (isFlagged) {
                  buttonStyle = 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                } else if (isAnswered) {
                  buttonStyle = 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                } else if (isQVisited) {
                  buttonStyle = 'bg-slate-900 border-slate-700 text-slate-200'
                }

                if (isCurrent) {
                  buttonStyle += ' ring-2 ring-violet-500 ring-offset-2 ring-offset-slate-950'
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => markVisited(idx)}
                    className={`h-10 rounded-lg border font-bold text-xs flex items-center justify-center transition-all ${buttonStyle}`}
                  >
                    {(idx + 1).toString().padStart(2, '0')}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-slate-900/80 pt-6 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Legend</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-cyan-500/10 border border-cyan-500/40" />
                <span className="text-slate-400 font-medium">Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-amber-500/10 border border-amber-500/40" />
                <span className="text-slate-400 font-medium">Flagged for Review</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-slate-900 border border-slate-700" />
                <span className="text-slate-400 font-medium">Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-slate-950 border border-slate-800" />
                <span className="text-slate-500 font-medium">Not Visited</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Side: Active Question Workspace */}
        <main className="col-span-3 flex flex-col justify-between p-8 space-y-8 overflow-y-auto">
          {/* Question Header Metadata */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Question {activeIdx + 1} of {quiz.questions.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-600/10 border border-violet-500/20 text-violet-400">
                  {currentQ.topic}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 border border-slate-800 text-slate-400">
                  {currentQ.difficulty}
                </span>
                <button
                  onClick={() => toggleFlag(currentQ.id)}
                  className={`p-1.5 rounded-lg border transition-all ${
                    flagged.has(currentQ.id)
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                  title="Flag for Review"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stem content (LaTeX math supported) */}
            <div className="text-lg text-slate-100 font-medium leading-relaxed bg-slate-900/20 p-6 border border-slate-900 rounded-2xl">
              <MathRenderer text={currentQ.stem} />
            </div>

            {/* Inputs based on problem type */}
            <div className="pt-4">
              {currentQ.type === 'single_mcq' && (
                <div className="space-y-3">
                  {currentQ.options.map((opt: any) => {
                    const isSelected = userAnswers[currentQ.id] === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleSingleMcqSelect(currentQ.id, opt.key)}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 ${
                          isSelected
                            ? 'border-violet-500 bg-violet-600/10 text-white font-medium shadow-md shadow-violet-600/5'
                            : 'border-slate-950 bg-slate-900/40 hover:border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                          isSelected
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-500'
                        }`}>
                          {opt.key}
                        </span>
                        <span><MathRenderer text={opt.text} /></span>
                      </button>
                    )
                  })}
                </div>
              )}

              {currentQ.type === 'multi_mcq' && (
                <div className="space-y-3">
                  {currentQ.options.map((opt: any) => {
                    const answers = userAnswers[currentQ.id] || []
                    const isSelected = answers.includes(opt.key)
                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleMultiMcqSelect(currentQ.id, opt.key)}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 ${
                          isSelected
                            ? 'border-violet-500 bg-violet-600/10 text-white font-medium shadow-md shadow-violet-600/5'
                            : 'border-slate-950 bg-slate-900/40 hover:border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 border ${
                          isSelected
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-500'
                        }`}>
                          {isSelected && <CheckSquare className="w-4 h-4 text-white" />}
                          {!isSelected && opt.key}
                        </span>
                        <span><MathRenderer text={opt.text} /></span>
                      </button>
                    )
                  })}
                </div>
              )}

              {currentQ.type === 'numerical_tita' && (
                <div className="space-y-3 max-w-sm">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Enter Decimal Answer Value
                  </label>
                  <div className="relative rounded-xl border border-slate-800 bg-slate-950">
                    <input
                      type="text"
                      pattern="-?[0-9]*\.?[0-9]*"
                      value={userAnswers[currentQ.id] || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        // Allow numbers, minus sign, and decimal point
                        if (val === '' || /^-?[0-9]*\.?[0-9]*$/.test(val)) {
                          handleTitaChange(currentQ.id, val)
                        }
                      }}
                      placeholder="e.g. 12.34"
                      className="w-full px-4 py-3 bg-transparent rounded-xl text-white font-medium outline-none placeholder-slate-700"
                    />
                    {currentQ.answer_key?.unit && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                        {currentQ.answer_key.unit}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between border-t border-slate-900/80 pt-6">
            <button
              onClick={() => markVisited(activeIdx - 1)}
              disabled={activeIdx === 0}
              className="px-4 py-2.5 rounded-lg border border-slate-900 hover:bg-slate-900/60 text-sm font-semibold flex items-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {activeIdx < quiz.questions.length - 1 ? (
              <button
                onClick={() => markVisited(activeIdx + 1)}
                className="px-4 py-2.5 rounded-lg border border-slate-900 hover:bg-slate-900/60 text-sm font-semibold flex items-center gap-1 transition-all"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setConfirmOpen(true)}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 font-bold text-sm flex items-center gap-1.5 transition-all shadow-md shadow-violet-600/10"
              >
                Submit Paper <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </main>
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-200">Confirm Exam Submission</h3>
                <p className="text-xs text-slate-500 mt-0.5">Are you sure you want to grade your answers?</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-3 rounded-lg bg-slate-950 border border-slate-900 text-slate-400">
                <span>Total Questions</span>
                <span className="font-bold text-slate-200">{quiz.questions.length}</span>
              </div>
              <div className={`flex justify-between p-3 rounded-lg border text-xs ${
                unansweredCount > 0
                  ? 'bg-rose-500/5 border-rose-500/25 text-rose-300'
                  : 'bg-slate-950 border-slate-900 text-slate-400'
              }`}>
                <span>Unanswered Questions</span>
                <span className="font-bold">{unansweredCount}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3 border border-slate-900 hover:bg-slate-900/60 rounded-xl text-xs font-semibold transition-all text-slate-400"
              >
                Keep Working
              </button>
              <button
                onClick={() => submitQuizAnswers()}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-violet-600/15"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Grading Answers <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto submitting screen overlay */}
      {isSubmitting && !confirmOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-slate-950 bg-opacity-95 text-center">
          <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
          <p className="font-bold text-slate-200 text-lg">Grading Exam Paper...</p>
          <p className="text-xs text-slate-500 mt-1">Comparing answers against deterministic answer key schemas...</p>
        </div>
      )}
    </div>
  )
}
