import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ATTACHMENT_TYPE_LABELS } from '../types'
import type { JobAttachment, AttachmentType } from '../types'

interface PhotoGalleryProps {
  attachments: JobAttachment[]
  currentUserId: string
  onDelete?: (attachmentId: string, storagePath: string) => void
}

const TYPE_ORDER: AttachmentType[] = ['job_photo', 'progress_photo', 'completion_photo', 'additional_photo']

export function PhotoGallery({ attachments, currentUserId, onDelete }: PhotoGalleryProps) {
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map())
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const fetchSignedUrls = useCallback(async () => {
    if (attachments.length === 0) return

    const urls = new Map<string, string>()
    await Promise.all(
      attachments.map(async (att) => {
        const { data, error } = await supabase.storage
          .from('job-attachments')
          .createSignedUrl(att.storage_path, 3600)

        if (!error && data) {
          urls.set(att.id, data.signedUrl)
        }
      })
    )
    setSignedUrls(urls)
  }, [attachments])

  useEffect(() => {
    fetchSignedUrls()
  }, [fetchSignedUrls])

  const openLightbox = async (index: number) => {
    setLightboxIndex(index)
    const att = attachments[index]
    const { data, error } = await supabase.storage
      .from('job-attachments')
      .createSignedUrl(att.storage_path, 3600)

    if (!error && data) {
      setLightboxUrl(data.signedUrl)
    }
  }

  const closeLightbox = () => {
    setLightboxIndex(null)
    setLightboxUrl(null)
  }

  const navigateLightbox = (direction: number) => {
    if (lightboxIndex === null) return
    const newIndex = (lightboxIndex + direction + attachments.length) % attachments.length
    setLightboxIndex(newIndex)
    setLightboxUrl(null)
    const att = attachments[newIndex]
    supabase.storage
      .from('job-attachments')
      .createSignedUrl(att.storage_path, 3600)
      .then(({ data, error }) => {
        if (!error && data) setLightboxUrl(data.signedUrl)
      })
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') navigateLightbox(-1)
      if (e.key === 'ArrowRight') navigateLightbox(1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex])

  if (attachments.length === 0) return null

  const grouped = TYPE_ORDER
    .map((type) => ({
      type,
      items: attachments.filter((a) => a.attachment_type === type),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <div key={group.type}>
          <h4 className="text-sm font-semibold text-neutral-700 mb-3">
            {ATTACHMENT_TYPE_LABELS[group.type]}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {group.items.map((att) => {
              const url = signedUrls.get(att.id)
              const canDelete = onDelete && att.uploaded_by === currentUserId
              return (
                <div key={att.id} className="relative group rounded-lg overflow-hidden border border-neutral-200">
                  {url ? (
                    <img
                      src={url}
                      alt={att.file_name}
                      onClick={() => {
                        const flatIndex = attachments.findIndex((a) => a.id === att.id)
                        openLightbox(flatIndex)
                      }}
                      className="w-full h-32 object-cover cursor-pointer transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-32 bg-neutral-100 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white px-2 py-1 text-xs truncate">
                    {att.caption || att.file_name}
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => onDelete?.(att.id, att.storage_path)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={closeLightbox}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox() }}
            className="absolute top-4 right-4 text-white text-3xl hover:text-neutral-300 transition-colors"
          >
            ×
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigateLightbox(-1) }}
            className="absolute left-4 text-white text-4xl hover:text-neutral-300 transition-colors"
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigateLightbox(1) }}
            className="absolute right-4 text-white text-4xl hover:text-neutral-300 transition-colors"
          >
            ›
          </button>
          <div className="max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {lightboxUrl ? (
              <img src={lightboxUrl} alt={attachments[lightboxIndex]?.file_name} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            ) : (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            )}
            {attachments[lightboxIndex] && (
              <div className="text-white text-sm mt-3 text-center">
                <p className="font-medium">{attachments[lightboxIndex].file_name}</p>
                {attachments[lightboxIndex].caption && (
                  <p className="text-neutral-300 mt-1">{attachments[lightboxIndex].caption}</p>
                )}
                <p className="text-neutral-400 text-xs mt-1">
                  {attachments[lightboxIndex].uploader?.full_name || attachments[lightboxIndex].uploader?.email || 'Unknown'} • {new Date(attachments[lightboxIndex].created_at).toLocaleDateString('en-AU')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
