import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sandboxUploads } from '@/utils/sandboxStore'

interface ParamsProps {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: ParamsProps) {
  try {
    const { id: sourceId } = await params

    if (!sourceId) {
      return NextResponse.json({ error: 'Missing source ID' }, { status: 400 })
    }

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

      // Query database
      const { data: source, error } = await supabase
        .from('content_source')
        .select('id, status, mode_flag, blueprint')
        .eq('id', sourceId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Failed to get source details:', error)
        return NextResponse.json({ error: 'Database error retrieving source status' }, { status: 500 })
      }

      if (!source) {
        return NextResponse.json({ error: 'Content source not found' }, { status: 404 })
      }

      return NextResponse.json({
        source_id: source.id,
        status: source.status,
        mode_flag: source.mode_flag,
        blueprint: source.blueprint
      })
    } else {
      // Sandbox: Query in-memory status
      const cached = sandboxUploads.get(sourceId)
      if (!cached) {
        return NextResponse.json({ error: 'Sandbox source not found' }, { status: 404 })
      }

      return NextResponse.json({
        source_id: sourceId,
        status: cached.status,
        mode_flag: cached.mode_flag,
        blueprint: cached.blueprint
      })
    }

  } catch (error: any) {
    console.error('Source GET route error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred fetching status' }, { status: 500 })
  }
}
