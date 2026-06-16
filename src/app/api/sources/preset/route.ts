import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  try {
    const { exam_code, exam_name } = await request.json()

    if (!exam_name) {
      return NextResponse.json({ error: 'Missing exam name' }, { status: 400 })
    }

    const sourceId = crypto.randomUUID()
    const hasKeys =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (hasKeys) {
      const supabase = await createClient()

      // Refresh user session
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { error } = await supabase
        .from('content_source')
        .insert({
          id: sourceId,
          user_id: user.id,
          type: 'preset_exam',
          exam_name,
          status: 'ready'
        })

      if (error) {
        console.error('Failed to save preset content source:', error)
        return NextResponse.json({ error: 'Database insertion failed' }, { status: 500 })
      }
    }

    return NextResponse.json({ source_id: sourceId })

  } catch (error: any) {
    console.error('Preset source route error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 })
  }
}
