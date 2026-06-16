import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateStreamWithRetry } from '@/utils/gemini'

interface ParamsProps {
  params: Promise<{ attempt_item_id: string }>
}

export async function POST(request: Request, { params }: ParamsProps) {
  try {
    const { attempt_item_id: attemptItemId } = await params
    const { message, sandbox_question_context, sandbox_chat_history } = await request.json()

    if (!attemptItemId || !message) {
      return NextResponse.json({ error: 'Missing parameter' }, { status: 400 })
    }

    let context: any = null
    let dbHistory: any[] = []

    const hasKeys =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (hasKeys && !sandbox_question_context) {
      const supabase = await createClient()

      // Refresh user session
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Fetch attempt item and parent attempt to verify ownership
      const { data: attemptItem, error: itemErr } = await supabase
        .from('attempt_item')
        .select(`
          *,
          attempt:attempt_id (*)
        `)
        .eq('id', attemptItemId)
        .single()

      if (itemErr || !attemptItem) {
        return NextResponse.json({ error: 'Attempt item not found' }, { status: 404 })
      }

      // Verify user owns parent attempt
      if (attemptItem.attempt.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Fetch the quiz to get the actual stem, options, and explanation
      const { data: quiz, error: quizErr } = await supabase
        .from('quiz')
        .select('questions')
        .eq('id', attemptItem.attempt.quiz_id)
        .single()

      if (quizErr || !quiz) {
        return NextResponse.json({ error: 'Quiz details not found' }, { status: 404 })
      }

      const rawQuestion = quiz.questions.find((q: any) => q.id === attemptItem.question_id)
      if (!rawQuestion) {
        return NextResponse.json({ error: 'Question details not found' }, { status: 404 })
      }

      context = {
        stem: rawQuestion.stem,
        type: rawQuestion.type,
        options: rawQuestion.options,
        user_answer: attemptItem.user_answer,
        correct_answer: rawQuestion.type === 'single_mcq'
          ? rawQuestion.answer_key.correct_option
          : rawQuestion.type === 'multi_mcq'
          ? rawQuestion.answer_key.correct_options
          : rawQuestion.type === 'subjective'
          ? rawQuestion.answer_key.sample_answer
          : rawQuestion.answer_key.value,
        topic: attemptItem.topic,
        explanation: rawQuestion.explanation
      }

      // Fetch prior chat messages
      const { data: messages } = await supabase
        .from('chat_message')
        .select('*')
        .eq('attempt_item_id', attemptItemId)
        .order('created_at', { ascending: true })

      dbHistory = messages || []
    } else {
      // Sandbox fallback parameters passed from the client
      if (!sandbox_question_context) {
        return NextResponse.json({ error: 'Sandbox context parameters required in sandbox mode' }, { status: 400 })
      }
      context = sandbox_question_context
      dbHistory = sandbox_chat_history || []
    }

    // Prepare system instructions for chatbot scope guard
    const correctAnswerStr = Array.isArray(context.correct_answer)
      ? context.correct_answer.join(', ')
      : String(context.correct_answer)

    const userAnswerStr = Array.isArray(context.user_answer)
      ? context.user_answer.join(', ')
      : context.user_answer !== null
      ? String(context.user_answer)
      : 'No Answer Provided'

    const CHAT_SYSTEM = `You are the AI Exam Companion per-question tutor.
Your task is to help the student understand this specific exam question.

Question details:
- Topic: ${context.topic}
- Question Type: ${context.type}
- Difficulty: ${context.difficulty || 'medium'}
- Question Stem: ${context.stem}
- Answer Options: ${context.options ? JSON.stringify(context.options) : 'None (Numerical Input)'}
- Correct Answer: ${correctAnswerStr}
- Student's Answer: ${userAnswerStr}
- Solution Explanation: ${context.explanation}

CRITICAL RULES OF ENGAGEMENT:
1. ONLY answer questions directly related to this question, its subject matter, formulas, options, explanation, and concepts.
2. Refuse politely to answer any general chit-chat, other unrelated questions, general web queries, or off-syllabus concepts.
3. If the user asks something off-topic, say: "I can only help you review the concepts related to this specific question ($topic). Let me know if you want to break down its solution step-by-step!"
4. Explain clearly and encourage active learning. Use LaTeX formulas enclosed in single dollar signs $...$ for inline equations where helpful. Do NOT include markdown code blocks for the overall text.`

    // Format history for Gemini SDK (converts client-side roles to user/model structure)
    const contents: any[] = []

    // Inject history
    dbHistory.forEach((msg) => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })
    })

    // Inject the new user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    })

    const model = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'

    // Call Gemini Stream wrapper
    const responseStream = await generateStreamWithRetry(contents, model, CHAT_SYSTEM)

    // Setup Event-Stream response
    const encoder = new TextEncoder()
    const customStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const token = chunk.text || ''
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: token })}\n\n`))
          }
        } catch (err: any) {
          console.error('Streaming error:', err)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`))
        } finally {
          controller.close()
        }
      }
    })

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred in Chatbot' }, { status: 500 })
  }
}
