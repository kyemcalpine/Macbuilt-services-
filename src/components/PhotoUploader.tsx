import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../types'
import type { AttachmentType } from '../types'

interface PhotoUploaderProps {
  jobId: string
  attachmentType: AttachmentType
  onUploaded: () => void
  label?: string
}

interface PendingFile {
  file: File
  previewUrl: string
  caption: string
  uploading: boolean
  error: string
}

function getExtension(file: File): string {
  const parts = file.name.split('.')
  if (parts.length > 1) return '.' + parts[parts.length - 1].toLowerCase()
  return ''
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return 'Unsupported file type. Allowed: JPEG, PNG, WebP, GIF.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File too large. Maximum size is 10 MB.'
  }
  return null
}

export function PhotoUploader({ jobId, attachmentType, onUploaded, label }: PhotoUploaderProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setGlobalError('')

    const newPending: PendingFile[] = []
    for (const file of Array.from(fileList)) {
      const validationError = validateFile(file)
      newPending.push({
        file,
        previewUrl: URL.createObjectURL(file),
        caption: '',
        uploading: false,
        error: validationError || '',
      })
    }
    setPendingFiles((prev) => [...prev, ...newPending])
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const removePending = (index: number) => {
    setPendingFiles((prev) => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[index].previewUrl)
      copy.splice(index, 1)
      return copy
    })
  }

  const updateCaption = (index: number, caption: string) => {
    setPendingFiles((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], caption }
      return copy
    })
  }

  const uploadSingle = async (index: number) => {
    setPendingFiles((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], uploading: true, error: '' }
      return copy
    })

    const item = pendingFiles[index]
    const validationError = validateFile(item.file)
    if (validationError) {
      setPendingFiles((prev) => {
        const copy = [...prev]
        copy[index] = { ...copy[index], uploading: false, error: validationError }
        return copy
      })
      return
    }

    const ext = getExtension(item.file)
    const tempId = crypto.randomUUID()
    const storagePath = `jobs/${jobId}/${tempId}${ext}`

    const { data: rpcData, error: rpcError } = await supabase.rpc('add_job_attachment', {
      p_job_id: jobId,
      p_attachment_type: attachmentType,
      p_storage_path: storagePath,
      p_file_name: item.file.name,
      p_mime_type: item.file.type,
      p_file_size: item.file.size,
      p_caption: item.caption.trim() || null,
    })

    if (rpcError || !rpcData) {
      setPendingFiles((prev) => {
        const copy = [...prev]
        copy[index] = { ...copy[index], uploading: false, error: rpcError?.message || 'Could not upload photo.' }
        return copy
      })
      return
    }

    const attachmentId = rpcData as string
    const finalPath = `jobs/${jobId}/${attachmentId}${ext}`

    const { error: uploadError } = await supabase.storage
      .from('job-attachments')
      .upload(finalPath, item.file, {
        contentType: item.file.type,
        upsert: false,
      })

    if (uploadError) {
      await supabase.rpc('delete_job_attachment', { p_attachment_id: attachmentId })
      setPendingFiles((prev) => {
        const copy = [...prev]
        copy[index] = { ...copy[index], uploading: false, error: uploadError.message || 'Could not upload file to storage.' }
        return copy
      })
      return
    }

    URL.revokeObjectURL(item.previewUrl)
    setPendingFiles((prev) => {
      const copy = [...prev]
      copy.splice(index, 1)
      return copy
    })
    onUploaded()
  }

  const uploadAll = async () => {
    for (let i = 0; i < pendingFiles.length; i++) {
      if (pendingFiles[i].error) continue
      await uploadSingle(i)
    }
  }

  return (
    <div className="space-y-4">
      {label && <h4 className="text-sm font-semibold text-neutral-700">{label}</h4>}

      {globalError && <div className="alert-error text-sm">{globalError}</div>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary-500 bg-primary-50' : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
        <p className="text-sm text-neutral-600">
          Drag and drop photos here, or click to select
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          JPEG, PNG, WebP, or GIF — max 10 MB each
        </p>
      </div>

      {pendingFiles.length > 0 && (
        <div className="space-y-3">
          {pendingFiles.map((item, index) => (
            <div key={index} className="flex items-start gap-3 border border-neutral-200 rounded-lg p-3">
              <img
                src={item.previewUrl}
                alt={item.file.name}
                className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">{item.file.name}</p>
                <p className="text-xs text-neutral-400">{(item.file.size / 1024).toFixed(0)} KB</p>
                <input
                  type="text"
                  value={item.caption}
                  onChange={(e) => updateCaption(index, e.target.value)}
                  placeholder="Caption (optional)"
                  className="input mt-1 text-sm"
                  disabled={item.uploading}
                />
                {item.error && <p className="text-xs text-red-600 mt-1">{item.error}</p>}
              </div>
              <div className="flex flex-col gap-1">
                {!item.uploading && !item.error && (
                  <button
                    onClick={() => uploadSingle(index)}
                    className="text-xs px-3 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  >
                    Upload
                  </button>
                )}
                {item.uploading && (
                  <span className="text-xs text-neutral-500 px-3 py-1">Uploading...</span>
                )}
                {!item.uploading && (
                  <button
                    onClick={() => removePending(index)}
                    className="text-xs px-3 py-1 rounded-md text-neutral-500 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}

          {pendingFiles.length > 1 && (
            <button
              onClick={uploadAll}
              className="btn-secondary text-sm w-full"
            >
              Upload All
            </button>
          )}
        </div>
      )}
    </div>
  )
}
