import { NextResponse } from 'next/server'
import { gradeSubjectiveAnswer } from '@/utils/gemini'

export async function POST(request: Request) {
  try {
    const { stem, sample_answer, rubric, user_answer } = await request.json()

    if (!stem || !sample_answer || user_answer === undefined) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const trimmedAnswer = typeof user_answer === 'string' ? user_answer.trim() : ''

    // If user answer is empty, grade it as 0/incorrect immediately without calling Gemini
    if (!trimmedAnswer) {
      return NextResponse.json({
        is_correct: false,
        score_pct: 0,
        feedback: 'No answer was provided for this question.'
      })
    }

    const result = await gradeSubjectiveAnswer(stem, sample_answer, rubric, trimmedAnswer)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Subjective grading API error:', err)
    return NextResponse.json({ error: err.message || 'Failed to grade subjective question' }, { status: 500 })
  }
}
