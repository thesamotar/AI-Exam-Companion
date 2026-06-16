// Shared in-memory map for Sandbox Mode uploads status polling
export interface SandboxUpload {
  status: 'analyzing' | 'ready' | 'error'
  blueprint: any
  mode_flag: 'similar' | 'trend'
  exam_name: string
}

const globalAny = global as any

if (!globalAny.sandboxUploads) {
  globalAny.sandboxUploads = new Map<string, SandboxUpload>()
}

export const sandboxUploads = globalAny.sandboxUploads as Map<string, SandboxUpload>
