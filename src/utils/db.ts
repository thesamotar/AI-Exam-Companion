import { createClient } from './supabase/client'

export interface ContentSource {
  id: string
  user_id: string
  type: 'preset_exam' | 'uploaded_papers' | 'notes' | 'handwriting'
  exam_name: string
  mode_flag?: 'similar' | 'trend' | null
  blueprint?: any
  file_paths?: string[] | null
  status: 'analyzing' | 'ready' | 'error'
  created_at: string
}

export interface Quiz {
  id: string
  user_id: string
  source_id: string
  length: 'SHORT' | 'MEDIUM' | 'HOUR'
  questions: any[] // questions stripped of answer_key on client
  created_at: string
}

export interface Attempt {
  id: string
  user_id: string
  quiz_id: string
  source_id: string
  score: number // 0..1
  started_at?: string
  submitted_at: string
  // Virtual properties joined for client convenience
  quiz?: Quiz
  content_source?: ContentSource
}

export interface AttemptItem {
  id: string
  attempt_id: string
  question_id: string
  topic: string
  user_answer: any
  is_correct: boolean
}

export interface ChatMessage {
  id: string
  attempt_item_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Check if we are running in sandbox/local fallback mode
export function isSandboxMode(): boolean {
  if (typeof window === 'undefined') return true
  const hasKeys =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sandboxSession = localStorage.getItem('ai_exam_sandbox_user')
  return !hasKeys || !!sandboxSession
}

// Get sandbox user
function getSandboxUser() {
  if (typeof window === 'undefined') return { id: 'sandbox-user', email: 'demo@examcompanion.ai' }
  const stored = localStorage.getItem('ai_exam_sandbox_user')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      return { id: 'sandbox-user', email: parsed.email || 'demo@examcompanion.ai' }
    } catch {
      // Ignore
    }
  }
  return { id: 'sandbox-user', email: 'demo@examcompanion.ai' }
}

// ============================================================================
// CONTENT SOURCES
// ============================================================================

export async function getSources(): Promise<ContentSource[]> {
  let rawList: ContentSource[] = []
  if (isSandboxMode()) {
    const list = localStorage.getItem('cs_sources')
    rawList = list ? JSON.parse(list) : []
  } else {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('content_source')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    rawList = data || []
  }

  // Deduplicate preset exams by exam_name
  const uniqueList: ContentSource[] = []
  const seenPresetExams = new Set<string>()
  let hasDuplicates = false

  for (const s of rawList) {
    if (s.type === 'preset_exam') {
      const key = s.exam_name.toUpperCase()
      if (seenPresetExams.has(key)) {
        hasDuplicates = true
        continue
      }
      seenPresetExams.add(key)
    }
    uniqueList.push(s)
  }

  if (isSandboxMode() && hasDuplicates) {
    localStorage.setItem('cs_sources', JSON.stringify(uniqueList))
  }

  return uniqueList
}

export async function saveSource(source: Omit<ContentSource, 'id' | 'user_id' | 'created_at'>): Promise<ContentSource> {
  const user = isSandboxMode() ? getSandboxUser() : (await createClient().auth.getUser()).data.user
  if (!user) throw new Error('Unauthenticated')

  const newSource: ContentSource = {
    ...source,
    id: crypto.randomUUID(),
    user_id: user.id,
    created_at: new Date().toISOString(),
  }

  if (isSandboxMode()) {
    const current = await getSources()
    localStorage.setItem('cs_sources', JSON.stringify([newSource, ...current]))
    return newSource
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('content_source')
    .insert([newSource])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSourceStatus(id: string, status: 'ready' | 'error', blueprint?: any): Promise<void> {
  if (isSandboxMode()) {
    const current = await getSources()
    const updated = current.map((s) => (s.id === id ? { ...s, status, blueprint } : s))
    localStorage.setItem('cs_sources', JSON.stringify(updated))
    return
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('content_source')
    .update({ status, blueprint })
    .eq('id', id)

  if (error) throw error
}

export async function getSourceById(id: string): Promise<ContentSource | null> {
  if (isSandboxMode()) {
    const current = await getSources()
    return current.find((s) => s.id === id) || null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('content_source')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

// ============================================================================
// QUIZZES
// ============================================================================

export async function getQuizById(id: string): Promise<Quiz | null> {
  if (isSandboxMode()) {
    const list = localStorage.getItem('cs_quizzes')
    const quizzes: Quiz[] = list ? JSON.parse(list) : []
    return quizzes.find((q) => q.id === id) || null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('quiz')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function saveQuiz(quiz: Omit<Quiz, 'id' | 'user_id' | 'created_at'>): Promise<Quiz> {
  const user = isSandboxMode() ? getSandboxUser() : (await createClient().auth.getUser()).data.user
  if (!user) throw new Error('Unauthenticated')

  const newQuiz: Quiz = {
    ...quiz,
    id: crypto.randomUUID(),
    user_id: user.id,
    created_at: new Date().toISOString(),
  }

  if (isSandboxMode()) {
    const list = localStorage.getItem('cs_quizzes')
    const quizzes: Quiz[] = list ? JSON.parse(list) : []
    localStorage.setItem('cs_quizzes', JSON.stringify([newQuiz, ...quizzes]))
    return newQuiz
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('quiz')
    .insert([newQuiz])
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// ATTEMPTS
// ============================================================================

export async function getAttempts(): Promise<Attempt[]> {
  if (isSandboxMode()) {
    const attemptsList = localStorage.getItem('cs_attempts')
    const attempts: Attempt[] = attemptsList ? JSON.parse(attemptsList) : []

    // Hydrate virtual properties for consistency
    const sources = await getSources()
    const quizzesList = localStorage.getItem('cs_quizzes')
    const quizzes: Quiz[] = quizzesList ? JSON.parse(quizzesList) : []

    return attempts.map((a) => ({
      ...a,
      quiz: quizzes.find((q) => q.id === a.quiz_id),
      content_source: sources.find((s) => s.id === a.source_id),
    })).sort((x, y) => new Date(y.submitted_at).getTime() - new Date(x.submitted_at).getTime())
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('attempt')
    .select(`
      *,
      content_source(*),
      quiz(*)
    `)
    .order('submitted_at', { ascending: false })

  if (error) throw error
  return (data || []) as any[]
}

export async function getAttemptById(id: string): Promise<Attempt | null> {
  if (isSandboxMode()) {
    const list = await getAttempts()
    return list.find((a) => a.id === id) || null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('attempt')
    .select(`
      *,
      content_source(*),
      quiz(*)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function saveAttempt(
  attempt: Omit<Attempt, 'id' | 'user_id' | 'submitted_at'>,
  items: Omit<AttemptItem, 'id' | 'attempt_id'>[]
): Promise<Attempt> {
  const user = isSandboxMode() ? getSandboxUser() : (await createClient().auth.getUser()).data.user
  if (!user) throw new Error('Unauthenticated')

  const attemptId = crypto.randomUUID()
  const newAttempt: Attempt = {
    ...attempt,
    id: attemptId,
    user_id: user.id,
    submitted_at: new Date().toISOString(),
  }

  const newItems: AttemptItem[] = items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    attempt_id: attemptId,
  }))

  if (isSandboxMode()) {
    // Save attempt
    const attemptsList = localStorage.getItem('cs_attempts')
    const attempts: Attempt[] = attemptsList ? JSON.parse(attemptsList) : []
    localStorage.setItem('cs_attempts', JSON.stringify([newAttempt, ...attempts]))

    // Save attempt items
    const itemsList = localStorage.getItem('cs_attempt_items')
    const currentItems: AttemptItem[] = itemsList ? JSON.parse(itemsList) : []
    localStorage.setItem('cs_attempt_items', JSON.stringify([...newItems, ...currentItems]))

    return newAttempt
  }

  const supabase = createClient()
  const { data: savedAttempt, error: attemptErr } = await supabase
    .from('attempt')
    .insert([newAttempt])
    .select()
    .single()

  if (attemptErr) throw attemptErr

  const { error: itemsErr } = await supabase
    .from('attempt_item')
    .insert(newItems)

  if (itemsErr) throw itemsErr

  return savedAttempt
}

export async function getAttemptItems(attemptId: string): Promise<AttemptItem[]> {
  if (isSandboxMode()) {
    const itemsList = localStorage.getItem('cs_attempt_items')
    const items: AttemptItem[] = itemsList ? JSON.parse(itemsList) : []
    return items.filter((item) => item.attempt_id === attemptId)
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('attempt_item')
    .select('*')
    .eq('attempt_id', attemptId)

  if (error) throw error
  return data || []
}

// ============================================================================
// CHAT MESSAGES
// ============================================================================

export async function getChatMessages(attemptItemId: string): Promise<ChatMessage[]> {
  if (isSandboxMode()) {
    const list = localStorage.getItem('cs_chat_messages')
    const messages: ChatMessage[] = list ? JSON.parse(list) : []
    return messages
      .filter((m) => m.attempt_item_id === attemptItemId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_message')
    .select('*')
    .eq('attempt_item_id', attemptItemId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function saveChatMessage(attemptItemId: string, role: 'user' | 'assistant', content: string): Promise<ChatMessage> {
  const newMessage: ChatMessage = {
    id: crypto.randomUUID(),
    attempt_item_id: attemptItemId,
    role,
    content,
    created_at: new Date().toISOString(),
  }

  if (isSandboxMode()) {
    const list = localStorage.getItem('cs_chat_messages')
    const messages: ChatMessage[] = list ? JSON.parse(list) : []
    localStorage.setItem('cs_chat_messages', JSON.stringify([...messages, newMessage]))
    return newMessage
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_message')
    .insert([newMessage])
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// ADAPTIVE LOOP (Weak Topics Biasing, §2.6)
// ============================================================================

export async function getWeakTopics(sourceId: string): Promise<string[]> {
  if (isSandboxMode()) {
    const itemsList = localStorage.getItem('cs_attempt_items')
    const items: AttemptItem[] = itemsList ? JSON.parse(itemsList) : []

    const attemptsList = localStorage.getItem('cs_attempts')
    const attempts: Attempt[] = attemptsList ? JSON.parse(attemptsList) : []

    // Filter items belonging to attempts of this content source
    const attemptIds = attempts.filter((a) => a.source_id === sourceId).map((a) => a.id)
    const filteredItems = items.filter((item) => attemptIds.includes(item.attempt_id))

    // Group and calculate accuracy
    const topicStats: Record<string, { correct: number; total: number }> = {}
    filteredItems.forEach((item) => {
      if (!topicStats[item.topic]) {
        topicStats[item.topic] = { correct: 0, total: 0 }
      }
      topicStats[item.topic].total++
      if (item.is_correct) {
        topicStats[item.topic].correct++
      }
    })

    return Object.entries(topicStats)
      .map(([topic, stats]) => ({
        topic,
        accuracy: stats.correct / stats.total,
      }))
      .filter((entry) => entry.accuracy < 0.6)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5)
      .map((entry) => entry.topic)
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('get_weak_topics_rpc', { p_source_id: sourceId })

  // Fallback if the RPC is not created yet (we can calculate it here using client code to be safe!)
  if (error) {
    console.warn('RPC weak topics failed, calculating client-side:', error.message)
    const { data: attempts } = await supabase
      .from('attempt')
      .select('id')
      .eq('source_id', sourceId)

    if (!attempts || attempts.length === 0) return []

    const attemptIds = attempts.map((a: any) => a.id)
    const { data: items } = await supabase
      .from('attempt_item')
      .select('topic, is_correct')
      .in('attempt_id', attemptIds)

    if (!items || items.length === 0) return []

    const topicStats: Record<string, { correct: number; total: number }> = {}
    items.forEach((item: any) => {
      if (!topicStats[item.topic]) {
        topicStats[item.topic] = { correct: 0, total: 0 }
      }
      topicStats[item.topic].total++
      if (item.is_correct) {
        topicStats[item.topic].correct++
      }
    })

    return Object.entries(topicStats)
      .map(([topic, stats]) => ({
        topic,
        accuracy: stats.correct / stats.total,
      }))
      .filter((entry) => entry.accuracy < 0.6)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5)
      .map((entry) => entry.topic)
  }

  return (data || []).map((row: any) => row.topic)
}

// Client-side cumulative metrics helper across all attempts
export async function getCumulativeStats(): Promise<{ accuracy: number; totalAttempts: number; weakTopics: string[] }> {
  const attempts = await getAttempts()
  if (attempts.length === 0) {
    return { accuracy: 0, totalAttempts: 0, weakTopics: [] }
  }

  const totalAttempts = attempts.length
  const avgAccuracy = attempts.reduce((sum, a) => sum + Number(a.score), 0) / totalAttempts

  // Calculate weak topics globally across all attempts
  let allItems: AttemptItem[] = []
  for (const att of attempts) {
    const items = await getAttemptItems(att.id)
    allItems = [...allItems, ...items]
  }

  const topicStats: Record<string, { correct: number; total: number }> = {}
  allItems.forEach((item) => {
    if (!topicStats[item.topic]) {
      topicStats[item.topic] = { correct: 0, total: 0 }
    }
    topicStats[item.topic].total++
    if (item.is_correct) {
      topicStats[item.topic].correct++
    }
  })

  const weakTopics = Object.entries(topicStats)
    .map(([topic, stats]) => ({
      topic,
      accuracy: stats.correct / stats.total,
    }))
    .filter((entry) => entry.accuracy < 0.6)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5)
    .map((entry) => entry.topic)

  return {
    accuracy: Math.round(avgAccuracy * 100),
    totalAttempts,
    weakTopics,
  }
}
