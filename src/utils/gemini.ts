import { GoogleGenAI } from '@google/genai'

// Client factory function
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in your environment variables. Please add it to your .env.local file.')
  }
  return new GoogleGenAI({ apiKey })
}

// Check if error is retryable (429 Rate Limit, 503 Service Unavailable, or RESOURCE_EXHAUSTED)
function isRetryableError(error: any): boolean {
  const message = error?.message || ''
  const status = error?.status || 0
  return (
    status === 429 ||
    status === 503 ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('Rate limit exceeded')
  )
}

// Exponential backoff runner
async function runWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    if (retries > 0 && isRetryableError(error)) {
      console.warn(`Gemini rate limited or transient error. Retrying in ${delay}ms... (${retries} retries left). Error: ${error.message || error}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return runWithRetry(fn, retries - 1, delay * 2)
    }
    throw error
  }
}

// Base text generator with retry
export async function generateTextWithRetry(
  prompt: string,
  modelName?: string,
  systemInstruction?: string,
  forceJson = false
): Promise<string> {
  const model = modelName || process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash'
  const client = getGeminiClient()

  return runWithRetry(async () => {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: forceJson ? 'application/json' : 'text/plain',
      },
    })
    return response.text || ''
  })
}

// Base streaming generator with retry
export async function generateStreamWithRetry(
  prompt: string | any[],
  modelName?: string,
  systemInstruction?: string
) {
  const model = modelName || process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'
  const client = getGeminiClient()

  return runWithRetry(async () => {
    // Standard format for contents in generateContentStream can be a string or array of parts/messages
    return await client.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        systemInstruction,
      },
    })
  })
}

// Utility to clean Markdown JSON wrapper code blocks
export function cleanJsonText(text: string): string {
  let clean = text.trim()
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/i, '')
    clean = clean.replace(/\n?```$/, '')
  }
  return clean.trim()
}

// JSON generator with retry and automatic malformed-JSON recovery prompt loop
export async function generateJSONWithRetry<T>(
  prompt: string,
  modelName: string,
  schemaPrompt: string,
  systemInstruction?: string
): Promise<T> {
  let attempts = 0
  let currentPrompt = prompt

  while (attempts < 2) {
    attempts++
    try {
      const rawText = await generateTextWithRetry(currentPrompt, modelName, systemInstruction, true)
      const cleaned = cleanJsonText(rawText)
      const parsed = JSON.parse(cleaned)
      return parsed as T
    } catch (err: any) {
      if (attempts === 1) {
        console.warn(`Gemini returned invalid JSON on attempt 1. Re-prompting with stricter formatting constraints. Error: ${err.message}`)
        currentPrompt = `${prompt}\n\nCRITICAL ERROR RESCUE:\nYour previous output failed to parse as JSON. Please return ONLY raw JSON matching this schema description: ${schemaPrompt}. Do not wrap the JSON output in markdown blocks or write any text outside of the JSON.`
      } else {
        throw new Error(`Failed to generate valid JSON schema after re-prompting: ${err.message || err}`)
      }
    }
  }
  throw new Error('Failed to generate valid JSON response.')
}

export interface SubjectiveGradeResult {
  is_correct: boolean
  score_pct: number
  feedback: string
}

export async function gradeSubjectiveAnswer(
  stem: string,
  sampleAnswer: string,
  rubric: string,
  userAnswer: string
): Promise<SubjectiveGradeResult> {
  const prompt = `You are an expert exam reviewer.
Evaluate the student's written answer to this question:
Question: ${stem}
Model Sample Answer: ${sampleAnswer}
Grading Rubric: ${rubric || 'None provided. Evaluate overall correctness and completeness.'}

Student's Answer: ${userAnswer}

Determine:
1. "score_pct": an integer score from 0 to 100 representing how well the student met the criteria.
2. "is_correct": boolean (true if score_pct >= 50, otherwise false).
3. "feedback": a concise (2-3 sentences) explanation of what was good and what could be improved based on the rubric.

Return ONLY a JSON object matching this schema:
{
  "is_correct": boolean,
  "score_pct": number,
  "feedback": "string"
}`

  const model = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash'
  const schemaPrompt = 'JSON object with keys: is_correct (boolean), score_pct (number), feedback (string)'

  return generateJSONWithRetry<SubjectiveGradeResult>(
    prompt,
    model,
    schemaPrompt,
    'You are an expert exam reviewer grading a subjective written answer.'
  )
}
