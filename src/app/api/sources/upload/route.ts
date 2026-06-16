import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateJSONWithRetry } from '@/utils/gemini'
import { sandboxUploads } from '@/utils/sandboxStore'

const ANALYZE_PROMPT = (mode: 'similar' | 'trend') => `You are an expert exam analyzer.
Analyze the provided PDF exam paper(s).
Identify the subject matter, topics covered, frequency of questions, weightage percentage of topics, difficulties, and question formats.

Mode: ${mode}
${
  mode === 'trend'
    ? 'Since the user has provided 3 or more exam papers, look for trends, repeating topics, focus transitions, and predict future focus areas.'
    : 'Analyze the general patterns to generate similar style questions.'
}

Return ONLY a JSON object matching this blueprint schema:
{
  "exam_name": "string",
  "mode_flag": "${mode}",
  "topics": [
    { "topic": "string", "frequency": "high|medium|low", "weightage_pct": 0 }
  ],
  "question_patterns": [
    { "type": "single_mcq|multi_mcq|numerical_tita",
      "share_pct": 0, "difficulty": "easy|medium|hard",
      "example_phrasing": "string" }
  ],
  "predicted_focus": ["string"]  // If trend mode, fill with predicted high-probability topics for next exam. If similar mode, set to empty array []
}`

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const examName = formData.get('exam_name') as string
    const files = formData.getAll('files') as File[]

    if (!examName || files.length === 0) {
      return NextResponse.json({ error: 'Missing exam name or files' }, { status: 400 })
    }

    // Validate files are PDFs and less than 10MB
    for (const file of files) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
      }
    }

    const modeFlag = files.length >= 3 ? 'trend' : 'similar'
    const sourceId = crypto.randomUUID()

    const hasKeys =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    let userId = 'sandbox-user'
    const filePaths: string[] = []

    if (hasKeys) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id

      // Upload each file to Supabase storage
      for (const file of files) {
        const path = `${userId}/${sourceId}/${crypto.randomUUID()}-${file.name}`
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadErr } = await supabase.storage
          .from('papers')
          .upload(path, buffer, {
            contentType: 'application/pdf',
            upsert: true
          })

        if (uploadErr) {
          console.error('File upload to storage failed:', uploadErr)
          return NextResponse.json({ error: 'Failed to upload PDF files to storage' }, { status: 500 })
        }
        filePaths.push(path)
      }

      // Create content_source entry
      const { error: insertErr } = await supabase
        .from('content_source')
        .insert({
          id: sourceId,
          user_id: userId,
          type: 'uploaded_papers',
          exam_name: examName,
          mode_flag: modeFlag,
          file_paths: filePaths,
          status: 'analyzing',
          blueprint: null
        })

      if (insertErr) {
        console.error('Failed to create content source:', insertErr)
        return NextResponse.json({ error: 'Failed to save content source metadata' }, { status: 500 })
      }
    } else {
      // Sandbox: initialize in-memory state
      sandboxUploads.set(sourceId, {
        status: 'analyzing',
        blueprint: null,
        mode_flag: modeFlag,
        exam_name: examName
      })
    }

    // Trigger asynchronous Gemini PDF Analysis
    // We run this in background without await to return 202 immediately
    triggerGeminiAnalysis(sourceId, files, modeFlag, examName, !hasKeys).catch((err) => {
      console.error('Gemini background analysis error:', err)
    })

    return NextResponse.json({
      source_id: sourceId,
      status: 'analyzing',
      mode_flag: modeFlag
    }, { status: 202 })

  } catch (error: any) {
    console.error('Upload route error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred during upload' }, { status: 500 })
  }
}

// Background analysis engine
async function triggerGeminiAnalysis(
  sourceId: string,
  files: File[],
  modeFlag: 'similar' | 'trend',
  examName: string,
  isSandbox: boolean
) {
  try {
    const contents: any[] = []

    // Convert file contents to base64 inline data for Gemini multimodal input
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      contents.push({
        inlineData: {
          data: base64,
          mimeType: 'application/pdf'
        }
      })
    }

    const promptText = `Analyze these uploaded exam papers for the exam named "${examName}".\n${ANALYZE_PROMPT(modeFlag)}`
    const schemaPrompt = 'JSON object matching blueprint schema: topics array, question_patterns array, predicted_focus array'
    const model = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash'

    // Run Gemini generation with retry logic
    const blueprint = await generateJSONWithRetry<any>(promptText, model, schemaPrompt)

    if (isSandbox) {
      // Update sandbox store
      sandboxUploads.set(sourceId, {
        status: 'ready',
        blueprint,
        mode_flag: modeFlag,
        exam_name: examName
      })
    } else {
      // Update Supabase Database
      const supabase = await createClient()
      const { error } = await supabase
        .from('content_source')
        .update({
          status: 'ready',
          blueprint
        })
        .eq('id', sourceId)

      if (error) throw error
    }
  } catch (err: any) {
    console.error(`Gemini background analysis failed for source ${sourceId}:`, err)
    if (isSandbox) {
      sandboxUploads.set(sourceId, {
        status: 'error',
        blueprint: null,
        mode_flag: modeFlag,
        exam_name: examName
      })
    } else {
      const supabase = await createClient()
      await supabase
        .from('content_source')
        .update({ status: 'error' })
        .eq('id', sourceId)
    }
  }
}
