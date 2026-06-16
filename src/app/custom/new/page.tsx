'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  ArrowLeft,
  FileUp,
  FileText,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  CheckCircle,
  HelpCircle
} from 'lucide-react'
import { isSandboxMode } from '@/utils/db'

export default function CustomNewPage() {
  const router = useRouter()
  const [examName, setExamName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<'uploading' | 'analyzing' | 'complete' | 'idle'>('idle')
  const [progressMessage, setProgressMessage] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sandbox, setSandbox] = useState(false)

  useEffect(() => {
    setSandbox(isSandboxMode())
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const newFiles = Array.from(e.target.files)
    addFiles(newFiles)
  }

  const addFiles = (newFiles: File[]) => {
    setError(null)
    const validFiles: File[] = []

    for (const file of newFiles) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        setError('Only PDF files are supported.')
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 10MB limit.`)
        continue
      }
      validFiles.push(file)
    }

    setFiles((prev) => [...prev, ...validFiles])
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUploadAndAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!examName.trim()) {
      setError('Please enter a name for the exam paper set.')
      return
    }
    if (files.length === 0) {
      setError('Please select at least 1 PDF exam paper.')
      return
    }

    setLoading(true)
    setError(null)
    setAnalysisStatus('uploading')
    setProgressMessage('Uploading PDFs to secure server storage...')

    const formData = new FormData()
    formData.append('exam_name', examName)
    files.forEach((file) => {
      formData.append('files', file)
    })

    try {
      // 1. Post files
      const res = await fetch('/api/sources/upload', {
        method: 'POST',
        body: formData
      })

      const uploadData = await res.json()

      if (!res.ok) {
        throw new Error(uploadData.error || 'Failed to upload files')
      }

      const createdSourceId = uploadData.source_id
      setSourceId(createdSourceId)
      setAnalysisStatus('analyzing')

      // 2. Poll Status
      pollStatus(createdSourceId)

    } catch (err: any) {
      console.error(err)
      setError(err.message || 'An error occurred during file upload')
      setAnalysisStatus('idle')
      setLoading(false)
    }
  }

  const pollStatus = (id: string) => {
    let elapsed = 0
    const interval = setInterval(async () => {
      elapsed += 2
      // Rotate messages based on elapsed time to show rich feedback
      if (elapsed < 6) {
        setProgressMessage('Natively parsing document vector structures...')
      } else if (elapsed < 12) {
        setProgressMessage('Extracting syllabus topics and grouping question patterns...')
      } else {
        setProgressMessage('Gemini 3.1 Flash is compiling the structural blueprint JSON...')
      }

      try {
        const res = await fetch(`/api/sources/${id}`)
        if (!res.ok) {
          throw new Error('Failed to query status')
        }

        const data = await res.json()

        if (data.status === 'ready') {
          clearInterval(interval)
          setAnalysisStatus('complete')
          setProgressMessage('Analysis successful! Syllabus blueprint generated.')

          // In sandbox mode, save results to client-side localStorage db
          if (sandbox) {
            const list = localStorage.getItem('cs_sources')
            const current = list ? JSON.parse(list) : []
            const newSource = {
              id,
              user_id: 'sandbox-user',
              type: 'uploaded_papers',
              exam_name: examName,
              mode_flag: data.mode_flag,
              blueprint: data.blueprint,
              status: 'ready',
              created_at: new Date().toISOString()
            }
            localStorage.setItem('cs_sources', JSON.stringify([newSource, ...current]))
          }

          // Delay redirect slightly for premium UX feedback
          setTimeout(() => {
            router.push('/')
            router.refresh()
          }, 1200)

        } else if (data.status === 'error') {
          clearInterval(interval)
          throw new Error('Gemini failed to extract exam blueprint. The PDF may be corrupt or unreadable.')
        }

      } catch (err: any) {
        clearInterval(interval)
        setError(err.message || 'Analysis failed')
        setAnalysisStatus('idle')
        setLoading(false)
      }
    }, 2000)
  }

  const isTrendModeUnlocked = files.length >= 3

  return (
    <div className="relative min-h-screen bg-slate-950 text-white pb-16">
      {/* Background radial highlight */}
      <div className="absolute top-0 left-0 w-[50%] h-[40%] rounded-full bg-violet-900/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[40%] rounded-full bg-cyan-950/10 blur-[130px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-sm bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Custom Upload
            </span>
          </div>
        </div>
      </header>

      {/* Main Panel */}
      <main className="max-w-2xl mx-auto px-4 mt-12">
        <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-900/80 backdrop-blur-xl shadow-2xl space-y-8">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Analyze Exam Papers
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Upload past exams to extract patterns and build custom-targeted quiz blueprints.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center gap-3 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-5 rounded-2xl bg-slate-950/60 border border-slate-900">
              {analysisStatus === 'complete' ? (
                <CheckCircle className="w-10 h-10 text-emerald-400 animate-bounce" />
              ) : (
                <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
              )}
              <div className="space-y-1.5">
                <p className="font-bold text-slate-200 capitalize">
                  {analysisStatus} Paper Set
                </p>
                <p className="text-xs text-cyan-400 font-medium animate-pulse">
                  {progressMessage}
                </p>
              </div>
              <div className="w-full max-w-xs bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-950">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    analysisStatus === 'complete'
                      ? 'bg-emerald-500 w-full'
                      : analysisStatus === 'uploading'
                      ? 'bg-cyan-500 w-1/4'
                      : 'bg-violet-600 w-3/4'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
                Gemini 3.1 Flash is reading the full PDF(s). Blueprint extraction takes between 10 to 20 seconds. Do not refresh this page.
              </p>
            </div>
          ) : (
            <form onSubmit={handleUploadAndAnalyze} className="space-y-6">
              {/* Exam Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Exam Set Name / Label
                </label>
                <input
                  type="text"
                  required
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="e.g. JEE Advanced Physics, NEET Biology 2025"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-white placeholder-slate-700 outline-none"
                />
              </div>

              {/* Drag Drop Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Select PDF Papers
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (e.dataTransfer.files) {
                      addFiles(Array.from(e.dataTransfer.files))
                    }
                  }}
                  className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-2xl p-8 bg-slate-950/40 hover:bg-slate-950/60 transition-all text-center flex flex-col items-center justify-center cursor-pointer group"
                >
                  <input
                    type="file"
                    multiple
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="pdf-file-upload"
                  />
                  <label htmlFor="pdf-file-upload" className="cursor-pointer w-full h-full flex flex-col items-center">
                    <FileUp className="w-10 h-10 text-slate-500 group-hover:text-cyan-400 transition-colors mb-3" />
                    <span className="text-sm font-semibold text-slate-300">
                      Drag &amp; drop PDF files here
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      or click to browse from folders (Max 10MB per file)
                    </span>
                  </label>
                </div>
              </div>

              {/* Warnings / Mode status info */}
              {!isTrendModeUnlocked ? (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 flex gap-3 text-xs text-amber-300">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Similar Question Mode</span>
                    Upload 3 or more exam papers to unlock <strong className="text-amber-200 font-semibold">Trend Prediction</strong> and forecasting metrics. Currently defaulting to similar-question patterns.
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex gap-3 text-xs text-emerald-300">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Trend Prediction Unlocked!</span>
                    3+ papers provided. Gemini will analyze repeating topic sequences and predict future focus areas for the blueprint.
                  </div>
                </div>
              )}

              {/* Selected Files List */}
              {files.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Selected Files ({files.length})
                  </h3>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                    {files.map((file, i) => (
                      <div
                        key={i}
                        className="px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-900 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate max-w-[80%]">
                          <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span className="font-semibold text-slate-300 truncate">{file.name}</span>
                          <span className="text-slate-500 text-[10px]">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={files.length === 0}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold transition-all shadow-lg shadow-violet-600/15 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FileUp className="w-5 h-5" /> Start Paper Analysis
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
