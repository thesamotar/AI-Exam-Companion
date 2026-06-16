import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateJSONWithRetry } from '@/utils/gemini'

// Quiz lengths mapping
const LENGTH_MAP = {
  SHORT: { questions: 5, duration_min: 10 },
  MEDIUM: { questions: 15, duration_min: 30 },
  HOUR: { questions: 30, duration_min: 60 }
}

// Validation function
function validateQuestions(questions: any[]): boolean {
  if (!Array.isArray(questions) || questions.length === 0) return false
  const ids = new Set()

  for (const q of questions) {
    if (!q.id || !q.type || !q.topic || !q.difficulty || !q.stem || !q.explanation) return false
    if (ids.has(q.id)) return false
    ids.add(q.id)

    if (!['single_mcq', 'multi_mcq', 'numerical_tita'].includes(q.type)) return false

    if (q.type === 'single_mcq' || q.type === 'multi_mcq') {
      if (!Array.isArray(q.options) || q.options.length !== 4) return false
      const keys = q.options.map((o: any) => o.key)
      if (new Set(keys).size !== 4) return false

      if (q.type === 'single_mcq') {
        if (!q.answer_key?.correct_option || !keys.includes(q.answer_key.correct_option)) return false
      } else {
        if (!Array.isArray(q.answer_key?.correct_options) || q.answer_key.correct_options.length === 0) return false
        if (q.answer_key.correct_options.some((o: string) => !keys.includes(o))) return false
      }
    } else if (q.type === 'numerical_tita') {
      if (q.options !== null && q.options !== undefined) return false
      if (typeof q.answer_key?.value !== 'number') return false
      if (typeof q.answer_key?.tolerance !== 'number') return false
    }
  }
  return true
}

export async function POST(request: Request) {
  try {
    const { source_id, length, sandbox_source, sandbox_weak_topics } = await request.json()

    if (!source_id || !length || !['SHORT', 'MEDIUM', 'HOUR'].includes(length)) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    const n = LENGTH_MAP[length as keyof typeof LENGTH_MAP].questions

    let sourceName = ''
    let blueprint: any = null
    let weakTopics: string[] = []
    let userId: string | null = null

    const hasKeys =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Load data from DB if credentials are set and we are not in sandbox override
    if (hasKeys && !sandbox_source) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id

      // Fetch source
      const { data: source, error: sourceErr } = await supabase
        .from('content_source')
        .select('*')
        .eq('id', source_id)
        .single()

      if (sourceErr || !source) {
        return NextResponse.json({ error: 'Content source not found' }, { status: 404 })
      }

      sourceName = source.exam_name
      blueprint = source.blueprint

      // Fetch weak topics from DB
      // Fetch topics with incorrect rates
      const { data: weakData } = await supabase
        .rpc('get_weak_topics_rpc', { p_source_id: source_id })

      if (weakData) {
        weakTopics = weakData.map((row: any) => row.topic)
      } else {
        // Fallback standard query in JS if RPC is missing
        const { data: attempts } = await supabase
          .from('attempt')
          .select('id')
          .eq('source_id', source_id)

        if (attempts && attempts.length > 0) {
          const attemptIds = attempts.map((a: any) => a.id)
          const { data: items } = await supabase
            .from('attempt_item')
            .select('topic, is_correct')
            .in('attempt_id', attemptIds)

          if (items && items.length > 0) {
            const stats: Record<string, { correct: number; total: number }> = {}
            items.forEach((item: any) => {
              if (!stats[item.topic]) stats[item.topic] = { correct: 0, total: 0 }
              stats[item.topic].total++
              if (item.is_correct) stats[item.topic].correct++
            })
            weakTopics = Object.entries(stats)
              .map(([topic, stat]) => ({ topic, acc: stat.correct / stat.total }))
              .filter(entry => entry.acc < 0.6)
              .sort((a, b) => a.acc - b.acc)
              .slice(0, 5)
              .map(entry => entry.topic)
          }
        }
      }
    } else {
      // Sandbox fallback mode (run parameters passed from the client)
      if (!sandbox_source) {
        return NextResponse.json({ error: 'Sandbox source parameter required in sandbox mode' }, { status: 400 })
      }
      sourceName = sandbox_source.exam_name
      blueprint = sandbox_source.blueprint
      weakTopics = sandbox_weak_topics || []
      userId = 'sandbox-user'
    }

    // 2. Build Gemini prompt
    const biasPercentage = weakTopics.length > 0 ? 40 : 0
    const weakTopicInstruction = weakTopics.length > 0
      ? `Ensure that approximately 40% of the questions (roughly ${Math.ceil(n * 0.4)} questions) target these weak topics: ${JSON.stringify(weakTopics)}. The remaining questions should cover other parts of the syllabus.`
      : ''

    const blueprintPrompt = blueprint
      ? `The questions must adhere to this analysis blueprint extracted from the uploaded exams:\n${JSON.stringify(blueprint)}`
      : `Generate standard syllabus questions for the entrance exam: ${sourceName}. Use standard topics associated with this exam (for JEE: Calculus, Mechanics, Organic Chemistry, etc. For NEET: Botany, Zoology, Human Physiology, Organic Chemistry, etc. For CAT: Quantitative Aptitude, Verbal Ability, Data Interpretation, etc. For SAT: Math (Algebra, Geometry, Data Analysis), Reading (Information and Ideas, Rhetoric), Writing (Standard English Conventions), etc. For GMAT/GRE: Quantitative Reasoning (Arithmetic, Algebra, Geometry, Data Sufficiency), Verbal Reasoning (Critical Reasoning, Reading Comprehension, Sentence Equivalence), etc.).`

    const prompt = `You are a professional test generation system.
Generate exactly ${n} questions of multiple choice or numerical formats for the exam paper: ${sourceName}.

${blueprintPrompt}
${weakTopicInstruction}

For each question, select one of these types:
1. "single_mcq": Multiple choice with exactly one correct option.
2. "multi_mcq": Multiple choice with one or more correct options.
3. "numerical_tita": Numeric answer entry (no options). Include "value", "tolerance" (allowed error margin e.g. 0.01 or 0.1), and "unit".

Ensure LaTeX formulas are enclosed in single dollar signs $...$ for inline equations and double dollar signs $$...$$ for block display equations.

CRITICAL EXPLANATION RULE:
For the "explanation" field, you MUST write a detailed step-by-step breakdown. Separate each step using double newlines (\n\n) and label them like "Step 1: ... \n\nStep 2: ...". Keep them clean and easy to read. Do not group the explanation steps into a single contiguous block of text.

Your output MUST be a JSON array of questions matching this schema format:
[
  {
    "id": "q1",
    "type": "single_mcq",
    "topic": "Matrices",
    "difficulty": "medium",
    "stem": "If $A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$, find $\\det(A)$.",
    "options": [
      { "key": "A", "text": "-2" },
      { "key": "B", "text": "2" },
      { "key": "C", "text": "-1" },
      { "key": "D", "text": "0" }
    ],
    "answer_key": {
      "correct_option": "A"
    },
    "explanation": "Step 1: Write down the formula for the determinant of a $2 \\times 2$ matrix $A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$, which is $\\det(A) = ad - bc$.\\n\\nStep 2: Substitute the values from matrix $A$: $a = 1$, $b = 2$, $c = 3$, and $d = 4$.\\n\\nStep 3: Calculate the value: $\\det(A) = 1(4) - 2(3) = 4 - 6 = -2$."
  },
  {
    "id": "q2",
    "type": "multi_mcq",
    "topic": "Organic Chemistry",
    "difficulty": "hard",
    "stem": "Which of the following compounds undergo nucleophilic substitution?",
    "options": [
      { "key": "A", "text": "Chlorobenzene" },
      { "key": "B", "text": "Benzyl chloride" },
      { "key": "C", "text": "Ethyl chloride" },
      { "key": "D", "text": "Vinyl chloride" }
    ],
    "answer_key": {
      "correct_options": ["B", "C"]
    },
    "explanation": "Step 1: Understand the mechanism of nucleophilic substitution. Alkyl halides and benzyl halides undergo substitution easily because the resulting carbocation or transition state is stabilized.\\n\\nStep 2: Identify benzyl chloride (B) and ethyl chloride (C) as compounds with highly reactive carbon-halogen bonds.\\n\\nStep 3: Recognize that chlorobenzene (A) and vinyl chloride (D) have partial double bond character due to resonance stabilization of the lone pairs on the chlorine atom, making nucleophilic substitution extremely difficult under standard conditions.\\n\\nStep 4: Therefore, only compounds B and C readily undergo substitution."
  },
  {
    "id": "q3",
    "type": "numerical_tita",
    "topic": "Kinematics",
    "difficulty": "easy",
    "stem": "A particle moves with speed $v(t) = 3t^2$ m/s. Find distance traveled from $t=0$ to $t=2$ s.",
    "options": null,
    "answer_key": {
      "value": 8.0,
      "tolerance": 0.01,
      "unit": "meters"
    },
    "explanation": "Step 1: Recall that distance traveled $s$ is the integral of speed $v(t)$ over the given time interval: $s = \\int_{t_1}^{t_2} v(t) dt$.\\n\\nStep 2: Set up the integral for the interval $t=0$ to $t=2$ with speed $v(t) = 3t^2$: $s = \\int_0^2 3t^2 dt$.\\n\\nStep 3: Find the antiderivative: $\\int 3t^2 dt = t^3$.\\n\\nStep 4: Evaluate the antiderivative at the limits: $[t^3]_0^2 = 2^3 - 0^3 = 8$ meters."
  }
]`

    const schemaPrompt = 'JSON array of question objects containing keys: id, type, topic, difficulty, stem, options, answer_key, explanation'
    const model = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash'

    // Call Gemini with validation and recovery re-prompt loop
    let questions: any[] = []
    let isValid = false
    let attempts = 0

    while (!isValid && attempts < 2) {
      attempts++
      try {
        questions = await generateJSONWithRetry<any[]>(prompt, model, schemaPrompt)
        isValid = validateQuestions(questions)
        if (!isValid && attempts === 1) {
          console.warn('Gemini questions failed validation on first attempt. Retrying generation...')
        }
      } catch (err: any) {
        if (attempts === 2) {
          throw err
        }
      }
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Failed to generate a valid question set schema.' }, { status: 502 })
    }

    // 3. Persist Quiz (Cloud Mode only; Sandbox persists client-side)
    let quizId = crypto.randomUUID()
    if (hasKeys && !sandbox_source) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('quiz')
        .insert({
          id: quizId,
          user_id: userId!,
          source_id,
          length,
          questions
        })
        .select()
        .single()

      if (error) {
        console.error('Failed to save quiz to DB:', error)
        return NextResponse.json({ error: 'Failed to persist generated quiz' }, { status: 500 })
      }
      quizId = data.id
    }

    // 4. Strip answer_key from payload before shipping to client (Security, §3.5)
    const strippedQuestions = questions.map((q) => {
      const { answer_key, ...rest } = q
      return rest
    })

    return NextResponse.json({
      quiz_id: quizId,
      questions: strippedQuestions,
      // For sandbox mode client persistence, return the full questions with keys
      // so the client can save the full quiz to its localStorage database.
      full_questions_for_sandbox: sandbox_source ? questions : undefined
    })

  } catch (error: any) {
    console.error('Quiz generation route error:', error)
    return NextResponse.json({
      error: error.message || 'An error occurred during quiz generation',
      code: error.status === 429 ? '429' : '500'
    }, { status: error.status === 429 ? 503 : 500 })
  }
}
