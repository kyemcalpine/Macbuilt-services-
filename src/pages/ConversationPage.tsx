import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useConversationMessages } from '../hooks/useConversationMessages'
import type { Conversation } from '../types'

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { profile } = useAuth()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loadingConv, setLoadingConv] = useState(true)
  const [convError, setConvError] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasMarkedRef = useRef(false)

  const { messages, loading: messagesLoading, sendMessage, markAsRead } = useConversationMessages(conversationId)

  const fetchConversation = useCallback(async () => {
    if (!conversationId) return
    setLoadingConv(true)
    setConvError('')

    const { data, error: fetchError } = await supabase
      .from('conversations')
      .select(`
        *,
        job:jobs!conversations_job_id_fkey (
          id, title, status
        ),
        customer:profiles!conversations_customer_id_fkey (
          id, email, full_name, business_name
        ),
        tradie:profiles!conversations_tradie_id_fkey (
          id, email, full_name, business_name
        )
      `)
      .eq('id', conversationId)
      .maybeSingle()

    if (fetchError || !data) {
      setConvError('Conversation not found.')
      setLoadingConv(false)
      return
    }

    const convData = data as Conversation

    if (profile && profile.id !== convData.customer_id && profile.id !== convData.tradie_id && profile.role !== 'admin') {
      setConvError('You do not have access to this conversation.')
      setLoadingConv(false)
      return
    }

    setConversation(convData)
    setLoadingConv(false)
  }, [conversationId, profile])

  useEffect(() => {
    fetchConversation()
  }, [fetchConversation])

  // Mark messages as read when the conversation is loaded or new messages arrive
  useEffect(() => {
    if (conversation && profile && !hasMarkedRef.current && !messagesLoading) {
      hasMarkedRef.current = true
      markAsRead()
    }
  }, [conversation, profile, messagesLoading, markAsRead])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!messageBody.trim() || sending) return
    setSending(true)
    setSendError('')
    const success = await sendMessage(messageBody)
    if (success) {
      setMessageBody('')
    } else {
      setSendError('Could not send your message. Please try again.')
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const getOtherParty = () => {
    if (!conversation || !profile) return null
    if (profile.id === conversation.customer_id) return conversation.tradie
    return conversation.customer
  }

  const isMyMessage = (senderId: string) => profile?.id === senderId

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (loadingConv) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (convError || !conversation) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error mb-6">{convError || 'An error occurred.'}</div>
        <Link to="/messages" className="btn-secondary">Back to Messages</Link>
      </div>
    )
  }

  const otherParty = getOtherParty()
  const otherPartyName = otherParty?.business_name || otherParty?.full_name || otherParty?.email || 'Unknown'
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link to="/messages" className="text-sm text-neutral-500 hover:text-primary-600 transition-colors mb-6 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Messages
      </Link>

      {/* Conversation header */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-neutral-600">
              {(otherPartyName.charAt(0) || '?').toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-neutral-900 truncate">{otherPartyName}</h1>
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                profile?.id === conversation.customer_id
                  ? 'bg-accent-100 text-accent-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {profile?.id === conversation.customer_id ? 'Tradie' : 'Customer'}
              </span>
              {conversation.job && (
                <Link to={`/jobs/${conversation.job.id}`} className="hover:text-primary-600 transition-colors truncate">
                  Re: {conversation.job.title}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {sendError && <div className="alert-error mb-4">{sendError}</div>}

      {/* Messages */}
      <div className="card p-0 overflow-hidden mb-4">
        <div className="max-h-[28rem] overflow-y-auto p-4 space-y-3 bg-neutral-50">
          {messagesLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-neutral-400">No messages yet. Start the conversation below.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const mine = isMyMessage(msg.sender_id)
              return (
                <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    mine
                      ? 'bg-primary-600 text-white'
                      : 'bg-white border border-neutral-200 text-neutral-800'
                  }`}>
                    {!mine && (
                      <p className={`text-xs font-medium mb-0.5 ${
                        msg.sender?.role === 'tradie' ? 'text-accent-600' : 'text-blue-600'
                      }`}>
                        {msg.sender?.business_name || msg.sender?.full_name || msg.sender?.email || 'Unknown'}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${mine ? 'text-primary-200' : 'text-neutral-400'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message input */}
      {!isAdmin && (
        <div className="card p-3">
          <div className="flex gap-2">
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={2}
              className="input flex-1 resize-none"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !messageBody.trim()}
              className="btn-primary px-6 self-end"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="card p-4 text-center">
          <p className="text-sm text-neutral-500">Admins can view conversations but cannot send messages.</p>
        </div>
      )}
    </div>
  )
}
