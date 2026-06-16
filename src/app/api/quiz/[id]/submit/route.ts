import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { gradeSubjectiveAnswer } from '@/utils/gemini'

interface ParamsProps {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: ParamsProps) {
  try {
    const { id: quizId } = await params
    const { answers } = await request.json()

    if (!quizId || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    const supabase = await createClient()

    // Refresh user session
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Idempotency: Check if an attempt already exists for this quiz
    const { data: existingAttempt } = await supabase
      .from('attempt')
      .select('id, score')
      .eq('quiz_id', quizId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingAttempt) {
      // Fetch attempt items to return graded results
      const { data: items } = await supabase
        .from('attempt_item')
        .select('*')
        .eq('attempt_id', existingAttempt.id)

      return NextResponse.json({
        attempt_id: existingAttempt.id,
        score: Number(existingAttempt.score),
        items: items || []
      })
    }

    // Fetch quiz questions
    const { data: quiz, error: quizErr } = await supabase
      .from('quiz')
      .select('*')
      .eq('id', quizId)
      .eq('user_id', user.id)
      .single()

    if (quizErr || !quiz) {
      return NextResponse.json({ error: 'Quiz not found or unauthorized' }, { status: 404 })
    }

    const questions = quiz.questions
    const attemptItems: any[] = []
    let correctCount = 0

    // Grading logic loop
    for (const q of questions) {
      const submitted = answers.find((a: any) => a.question_id === q.id)
      const userVal = submitted ? submitted.value : null
      let isCorrect = false
      let userAnsPayload: any = userVal

      if (userVal === null || userVal === undefined || userVal === '' || (Array.isArray(userVal) && userVal.length === 0)) {
        isCorrect = false;
        if (q.type === 'subjective') {
          userAnsPayload = { text: '', feedback: 'No answer was provided for this question.', score_pct: 0 }
        }
      } else if (q.type === 'single_mcq') {
        isCorrect = userVal === q.answer_key.correct_option
      } else if (q.type === 'multi_mcq') {
        const userSet = new Set(userVal)
        const correctSet = new Set(q.answer_key.correct_options || [])
        isCorrect =
          userSet.size === correctSet.size &&
          [...userSet].every((k) => correctSet.has(k))
      } else if (q.type === 'numerical_tita') {
        const valFloat = parseFloat(userVal)
        const targetFloat = q.answer_key.value
        const tol = q.answer_key.tolerance
        isCorrect = !isNaN(valFloat) && Math.abs(valFloat - targetFloat) <= tol
      } else if (q.type === 'subjective') {
        try {
          const grading = await gradeSubjectiveAnswer(
            q.stem,
            q.answer_key.sample_answer,
            q.answer_key.rubric,
            userVal
          )
          isCorrect = grading.is_correct
          userAnsPayload = {
            text: userVal,
            feedback: grading.feedback,
            score_pct: grading.score_pct
          }
        } catch (err) {
          console.error('Gemini subjective grading failed in submit endpoint:', err)
          isCorrect = true // fallback to credit completion
          userAnsPayload = {
            text: userVal,
            feedback: 'Grading failed due to an error, but completion was credited.',
            score_pct: 100
          }
        }
      }

      if (isCorrect) {
        correctCount++
      }

      attemptItems.push({
        question_id: q.id,
        topic: q.topic,
        user_answer: userAnsPayload,
        is_correct: isCorrect
      })
    }

    const score = correctCount / questions.length
    const attemptId = crypto.randomUUID()

    // 1. Insert Attempt parent
    const { error: attemptErr } = await supabase
      .from('attempt')
      .insert({
        id: attemptId,
        user_id: user.id,
        quiz_id: quizId,
        source_id: quiz.source_id,
        score
      })

    if (attemptErr) {
      console.error('Failed to create attempt:', attemptErr)
      return NextResponse.json({ error: 'Failed to save quiz attempt' }, { status: 500 })
    }

    // 2. Insert Attempt Items children
    const formattedItems = attemptItems.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      attempt_id: attemptId
    }))

    const { error: itemsErr } = await supabase
      .from('attempt_item')
      .insert(formattedItems)

    if (itemsErr) {
      console.error('Failed to create attempt items:', itemsErr)
      return NextResponse.json({ error: 'Failed to save attempt detail items' }, { status: 500 })
    }

    // 3. Return results
    return NextResponse.json({
      attempt_id: attemptId,
      score,
      items: formattedItems
    })

  } catch (error: any) {
    console.error('Submit route error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred during grading' }, { status: 500 })
  }
}
