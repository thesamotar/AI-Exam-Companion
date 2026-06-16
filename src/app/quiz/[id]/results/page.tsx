'use client'

import * as React from 'react'
import { useEffect, useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  ArrowLeft,
  CheckCircle,
  XCircle,
  MessageSquare,
  HelpCircle,
  Loader2,
  X,
  Send,
  AlertCircle,
  BookOpen
} from 'lucide-react'
import {
  getAttemptById,
  getAttemptItems,
  getChatMessages,
  saveChatMessage,
  isSandboxMode,
  Attempt,
  AttemptItem,
  ChatMessage
} from '@/utils/db'
import MathRenderer from '@/components/MathRenderer'

function renderExplanationSteps(explanation: string, isCorrect: boolean) {
  if (!explanation) return null

  // Clean up and pre-parse inline steps to ensure they split onto separate lines.
  let normalized = explanation
  
  // 1. If step designations are inline, e.g., "Step 1: ... Step 2: ...", insert newlines before them
  normalized = normalized.replace(/([^\n])\s*(Step\s*\d+[:.]?)/gi, '$1\n$2')
  
  // 2. If numbered lists are inline, e.g., ". 1. ... . 2. ...", insert newlines before them
  // We match a sentence end (., !, ?) followed by whitespace and a number + dot prefix
  normalized = normalized.replace(/(\.|\!|\?)\s+(\d+\.\s+[A-Za-z])/g, '$1\n$2')

  const paragraphs = normalized.split(/\n+/g).map(p => p.trim()).filter(Boolean)

  if (paragraphs.length === 0) return null

  const dotBg = isCorrect
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : 'bg-violet-500/10 border-violet-500/30 text-violet-400'

  return (
    <div className="relative border-l border-slate-800/80 ml-3 space-y-6 my-4">
      {paragraphs.map((para, idx) => {
        // Check if it already starts with "Step X:" or similar
        const hasStepPrefix = /^step\s*\d+\s*:/i.test(para)
        let displayPara = para
        let stepTitle = `Step ${idx + 1}`

        if (hasStepPrefix) {
          const match = para.match(/^step\s*\d+\s*:\s*([\s\S]*)/i)
          if (match) {
            displayPara = match[1]
            const titleMatch = para.match(/^(step\s*\d+)/i)
            stepTitle = titleMatch ? titleMatch[1] : stepTitle
          }
        } else {
          // If it doesn't start with "Step X:", check if it starts with "1.", "2.", etc.
          const hasNumPrefix = /^\d+\.\s*([\s\S]*)/.test(para)
          if (hasNumPrefix) {
            const match = para.match(/^(\d+)\.\s*([\s\S]*)/)
            if (match) {
              displayPara = match[2]
              stepTitle = `Step ${match[1]}`
            }
          }
        }

        return (
          <div key={idx} className="relative pl-6">
            {/* Timeline node badge centered on left border */}
            <div className={`absolute -left-2.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold bg-slate-950/90 shadow ${dotBg}`}>
              {idx + 1}
            </div>
            
            {/* Step card content */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400/90">
                {stepTitle}
              </div>
              <div className="text-sm text-slate-300 leading-relaxed font-medium">
                <MathRenderer text={displayPara} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


interface ResultsPageProps {
  params: Promise<{ id: string }>
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { id: attemptId } = use(params)
  const router = useRouter()

  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [attemptItems, setAttemptItems] = useState<AttemptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sandbox, setSandbox] = useState(false)

  // Chat Panel State
  const [activeItem, setActiveItem] = useState<AttemptItem | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load attempt results
  useEffect(() => {
    async function loadResults() {
      try {
        const isSandbox = isSandboxMode()
        setSandbox(isSandbox)

        const attemptObj = await getAttemptById(attemptId)
        if (!attemptObj) {
          router.push('/')
          return
        }
        setAttempt(attemptObj)

        const items = await getAttemptItems(attemptId)
        setAttemptItems(items)
      } catch (err) {
        console.error('Failed to load attempt results:', err)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }
    loadResults()
  }, [attemptId, router])

  // Load chat messages when active item changes
  useEffect(() => {
    if (!activeItem) return

    async function loadChat() {
      setChatMessages([])
      setChatError(null)
      try {
        const history = await getChatMessages(activeItem!.id)
        setChatMessages(history)
      } catch (err) {
        console.error('Failed to load chat history:', err)
      }
    }
    loadChat()
  }, [activeItem])

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm tracking-wide">Retrieving exam scorecard...</p>
      </div>
    )
  }

  if (!attempt || !attempt.quiz) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <AlertCircle className="w-10 h-10 text-rose-500 mb-4" />
        <p className="text-slate-400 text-sm">Attempt scorecard not found.</p>
        <Link href="/" className="mt-4 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold">
          Return to Dashboard
        </Link>
      </div>
    )
  }

  const scorePct = Math.round(Number(attempt.score) * 100)
  const questions = attempt.quiz.questions

  // Group items by topic to calculate diagnostic metrics
  const topicBreakdown: Record<string, { correct: number; total: number }> = {}
  attemptItems.forEach((item) => {
    if (!topicBreakdown[item.topic]) {
      topicBreakdown[item.topic] = { correct: 0, total: 0 }
    }
    topicBreakdown[item.topic].total++
    if (item.is_correct) {
      topicBreakdown[item.topic].correct++
    }
  })

  // Start chatbot query
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !activeItem || chatLoading) return

    const userText = chatInput.trim()
    setChatInput('')
    setChatLoading(true)
    setChatError(null)

    // Find full question details from the quiz
    const matchedQ = questions.find((q) => q.id === activeItem.question_id)
    if (!matchedQ) {
      setChatError('Question details not found')
      setChatLoading(false)
      return
    }

    try {
      // 1. Persist user message to DB/localStorage immediately
      const savedUserMsg = await saveChatMessage(activeItem.id, 'user', userText)
      setChatMessages((prev) => [...prev, savedUserMsg])

      // 2. Prepare payload
      const sandboxContext = sandbox ? {
        stem: matchedQ.stem,
        type: matchedQ.type,
        options: matchedQ.options,
        user_answer: activeItem.user_answer,
        correct_answer: matchedQ.type === 'single_mcq'
          ? matchedQ.answer_key.correct_option
          : matchedQ.type === 'multi_mcq'
          ? matchedQ.answer_key.correct_options
          : matchedQ.answer_key.value,
        topic: activeItem.topic,
        explanation: matchedQ.explanation
      } : undefined

      const sandboxHistory = sandbox ? chatMessages : undefined

      // 3. Request streaming endpoint
      const response = await fetch(`/api/chat/${activeItem.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userText,
          sandbox_question_context: sandboxContext,
          sandbox_chat_history: sandboxHistory
        })
      })

      if (!response.ok) {
        throw new Error('Tutor service was rate limited or hit an error')
      }

      // Add temporary empty assistant message to write streamed chunks into
      const tempId = crypto.randomUUID()
      let assistantText = ''
      setChatMessages((prev) => [
        ...prev,
        { id: tempId, attempt_item_id: activeItem.id, role: 'assistant', content: '', created_at: new Date().toISOString() }
      ])

      // Read chunk stream reader
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No stream body available')

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Process SSE lines
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.slice(6).trim()
              if (!dataStr) continue
              const parsed = JSON.parse(dataStr)
              if (parsed.error) {
                throw new Error(parsed.error)
              }
              if (parsed.text) {
                assistantText += parsed.text
                setChatMessages((prev) =>
                  prev.map((msg) => (msg.id === tempId ? { ...msg, content: assistantText } : msg))
                )
              }
            } catch (err) {
              // Ignore line parse warnings
            }
          }
        }
      }

      // 4. Save final full assistant response to DB/localStorage
      await saveChatMessage(activeItem.id, 'assistant', assistantText)

    } catch (err: any) {
      console.error('Chat error:', err)
      setChatError(err.message || 'Tutoring connection failed. Try again.')
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white pb-16 flex flex-col">
      {/* Background neon glows */}
      <div className="absolute top-0 right-0 w-[50%] h-[30%] rounded-full bg-violet-900/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[50%] h-[30%] rounded-full bg-cyan-950/10 blur-[130px] pointer-events-none" />

      {/* Header bar */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 h-16 flex items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Exit Review
        </Link>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-bold text-sm bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Exam Performance Summary
          </span>
        </div>
      </header>

      {/* Scorecard panel */}
      <div className="max-w-6xl mx-auto w-full px-6 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Statistics panel */}
        <section className="lg:col-span-1 space-y-6">
          {/* Radial Accuracy Gauge */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 backdrop-blur-md flex flex-col items-center text-center space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Attempt Score</h3>
            <div className="relative flex items-center justify-center w-36 h-36">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-slate-800" strokeWidth="8" fill="transparent" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-violet-600 transition-all duration-1000"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * scorePct) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-white">{scorePct}%</span>
                <span className="text-[10px] text-slate-500 font-semibold mt-0.5">
                  {attemptItems.filter((i) => i.is_correct).length} / {questions.length} Correct
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                Graded deterministically using exact answer values.
              </p>
            </div>
          </div>

          {/* Topic Performance List */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Topic Diagnostics</h3>
            </div>
            <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              {Object.entries(topicBreakdown).map(([topic, stats]) => {
                const topicPct = Math.round((stats.correct / stats.total) * 100)
                const isWeak = topicPct < 60
                return (
                  <div key={topic} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-300 truncate max-w-[150px]">{topic}</span>
                      <span className={isWeak ? 'text-rose-400' : 'text-emerald-400'}>
                        {topicPct}% ({stats.correct}/{stats.total})
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden border border-slate-900/80">
                      <div
                        className={`h-full rounded-full ${isWeak ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${topicPct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Graded solutions workspace */}
        <section className="lg:col-span-2 space-y-6">
          <h3 className="text-lg font-bold text-slate-300">Question-by-Question Review</h3>
          <div className="space-y-6">
            {questions.map((q, idx) => {
              const item = attemptItems.find((i) => i.question_id === q.id)
              const isCorrect = item?.is_correct || false
              const userAnswer = item?.user_answer

              // Format answer labels
              let printedUserAns = 'No Answer'
              if (userAnswer !== null && userAnswer !== undefined) {
                printedUserAns = Array.isArray(userAnswer) ? userAnswer.join(', ') : String(userAnswer)
              }

              let printedCorrectAns = ''
              if (q.type === 'single_mcq') {
                printedCorrectAns = q.answer_key.correct_option
              } else if (q.type === 'multi_mcq') {
                printedCorrectAns = q.answer_key.correct_options.join(', ')
              } else {
                printedCorrectAns = `${q.answer_key.value} (tolerance &plusmn; ${q.answer_key.tolerance})`
              }

              const isChatActive = activeItem?.id === item?.id

              return (
                <div
                  key={q.id}
                  className={`p-6 rounded-2xl border bg-slate-900/20 backdrop-blur-sm space-y-4 transition-all ${
                    isCorrect ? 'border-emerald-500/25' : 'border-rose-500/25'
                  }`}
                >
                  {/* Status header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`p-1 rounded-lg ${isCorrect ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {isCorrect ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </span>
                      <span className="text-xs font-bold text-slate-400">Question {idx + 1}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 border border-slate-900 text-slate-500">
                        {q.topic}
                      </span>
                      {item && (
                        <button
                          onClick={() => setActiveItem(item)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                            isChatActive
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-violet-400'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Tutor Companion
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question Stem (Math rendering) */}
                  <div className="text-base text-slate-200 font-medium leading-relaxed bg-slate-950/40 p-4 border border-slate-900/60 rounded-xl">
                    <MathRenderer text={q.stem} />
                  </div>

                  {/* MCQ Options Display */}
                  {q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt: any) => {
                        const isUserSelected = Array.isArray(userAnswer)
                          ? userAnswer.includes(opt.key)
                          : userAnswer === opt.key
                        const isCorrectOption = q.type === 'single_mcq'
                          ? q.answer_key.correct_option === opt.key
                          : q.answer_key.correct_options.includes(opt.key)

                        let borderStyle = 'border-slate-900 bg-slate-900/20'
                        if (isCorrectOption) {
                          borderStyle = 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300 font-semibold'
                        } else if (isUserSelected && !isCorrect) {
                          borderStyle = 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                        }

                        return (
                          <div key={opt.key} className={`p-3 rounded-lg border flex items-center gap-2 ${borderStyle}`}>
                            <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider">{opt.key}.</span>
                            <span className="truncate">{opt.text}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Submission detail logs */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-900 text-xs text-slate-400">
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Your Answer</p>
                      <p className={`font-bold mt-0.5 ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {printedUserAns}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Correct Answer</p>
                      <p className="font-bold text-slate-200 mt-0.5">{printedCorrectAns}</p>
                    </div>
                  </div>

                  {/* Explanation (LaTeX supported) */}
                  <div className={`p-5 rounded-r-xl rounded-l-md bg-slate-900/40 border border-slate-900 border-l-4 ${
                    isCorrect ? 'border-l-emerald-500 bg-emerald-500/[0.02]' : 'border-l-violet-500 bg-violet-500/[0.02]'
                  } space-y-2`}>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Sparkles className={`w-3.5 h-3.5 ${isCorrect ? 'text-emerald-400' : 'text-violet-400'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Solution Explanation</span>
                    </div>
                    {renderExplanationSteps(q.explanation, isCorrect)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Floating sliding chatbot tutoring drawer */}
      {activeItem && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900/95 border-l border-slate-800 backdrop-blur-xl shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300">
          {/* Chat drawer header */}
          <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 bg-slate-900/40">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-violet-400" />
              <div>
                <h3 className="font-bold text-sm text-slate-200">Tutor Companion</h3>
                <p className="text-[10px] text-slate-500">Topic: {activeItem.topic}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveItem(null)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Question Summary (Collapsible top panel for context) */}
          <div className="p-4 border-b border-slate-900/80 bg-slate-950/40 text-xs shrink-0 max-h-36 overflow-y-auto">
            <span className="font-bold text-slate-500">Context: </span>
            <span className="text-slate-400 leading-relaxed italic">
              <MathRenderer
                text={
                  questions.find(q => q.id === activeItem.question_id)?.stem || ''
                }
              />
            </span>
          </div>

          {/* Chat conversation feed */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-900/20">
            {chatMessages.length === 0 && !chatLoading && (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-2 h-full">
                <HelpCircle className="w-8 h-8 text-slate-700" />
                <p className="text-xs font-semibold text-slate-400">Ask a Question</p>
                <p className="text-[11px] text-slate-600 leading-relaxed max-w-[200px]">
                  Unsure why you missed this? Ask the tutor for a step-by-step breakdown or conceptual explanation.
                </p>
              </div>
            )}

            {chatMessages.map((msg) => {
              const isUser = msg.role === 'user'
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm font-medium ${
                      isUser
                        ? 'bg-violet-600 text-white rounded-tr-none'
                        : 'bg-slate-950 border border-slate-900 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    <MathRenderer text={msg.content} />
                  </div>
                </div>
              )
            })}

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-950 border border-slate-900 text-slate-400 px-4 py-3 rounded-2xl rounded-tl-none text-xs flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75" />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150" />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-300" />
                  </span>
                  <span>Tutor is writing...</span>
                </div>
              </div>
            )}

            {chatError && (
              <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/25 flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{chatError}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat input controls */}
          <form onSubmit={handleSendChatMessage} className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
              placeholder="Ask a question about this topic..."
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl text-xs text-white placeholder-slate-600 outline-none transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className="p-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
