import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Conversation } from '../types'

interface ConversationWithMeta extends Conversation {
  last_message_body?: string | null
  last_message_at?: string | null
  unread_count?: number
}

export function ConversationsPage() {
  const { profile } = useAuth()
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchConversations = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError('')

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
      .or(`customer_id.eq.${profile.id},tradie_id.eq.${profile.id}`)
      .order('updated_at', { ascending: false })

    if (fetchError) {
      setError('Could not load your conversations.')
      setLoading(false)
      return
    }

    const conversationsData = (data || []) as ConversationWithMeta[]

    // Fetch last message and unread count for each conversation
    if (conversationsData.length > 0) {
      const conversationIds = conversationsData.map((c) => c.id)
      const { data: msgData } = await supabase
        .from('messages')
        .select('conversation_id, body, sender_id, read_at, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })

      if (msgData) {
        const lastMessages: Record<string, { body: string; created_at: string }> = {}
        const unreadCounts: Record<string, number> = {}

        for (const msg of msgData) {
          if (!lastMessages[msg.conversation_id]) {
            lastMessages[msg.conversation_id] = { body: msg.body, created_at: msg.created_at }
          }
          if (msg.sender_id !== profile.id && !msg.read_at) {
            unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1
          }
        }

        conversationsData.forEach((c) => {
          const lm = lastMessages[c.id]
          c.last_message_body = lm?.body || null
          c.last_message_at = lm?.created_at || c.updated_at
          c.unread_count = unreadCounts[c.id] || 0
        })
      }
    }

    setConversations(conversationsData)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    fetchConversations()

    const channel = supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchConversations()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchConversations])

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  }

  const getOtherParty = (conv: ConversationWithMeta) => {
    if (profile?.id === conv.customer_id) {
      return conv.tradie
    }
    return conv.customer
  }

  const getOtherPartyName = (conv: ConversationWithMeta) => {
    const other = getOtherParty(conv)
    return other?.full_name || other?.email || 'Unknown'
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">Could not load your profile. Please try refreshing the page.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-neutral-900 mb-2">Messages</h1>
      <p className="text-neutral-600 mb-8">Your conversations with customers and tradies</p>

      {error && <div className="alert-error mb-6">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : conversations.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-neutral-500 mb-2">No conversations yet.</p>
          <p className="text-sm text-neutral-400">
            {profile.role === 'customer'
              ? 'When a tradie submits a quote on your job, you can start a conversation with them.'
              : 'Submit a quote or interest on a job to start a conversation with the customer.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => {
            const other = getOtherParty(conv)
            const isCustomer = profile.id === conv.customer_id
            return (
              <Link
                key={conv.id}
                to={`/messages/${conv.id}`}
                className={`card p-4 hover:shadow-md transition-shadow flex items-start gap-4 ${
                  (conv.unread_count || 0) > 0 ? 'border-primary-200 bg-primary-50/30' : ''
                }`}
              >
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center">
                    <span className="text-sm font-semibold text-neutral-600">
                      {(getOtherPartyName(conv).charAt(0) || '?').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-neutral-900 truncate">
                        {other?.business_name || getOtherPartyName(conv)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 flex-shrink-0">
                        {isCustomer ? 'Tradie' : 'Customer'}
                      </span>
                    </div>
                    {conv.last_message_at && (
                      <span className="text-xs text-neutral-400 flex-shrink-0">
                        {formatRelativeTime(conv.last_message_at)}
                      </span>
                    )}
                  </div>

                  {conv.job && (
                    <p className="text-xs text-neutral-500 mb-1 truncate">
                      Re: {conv.job.title}
                    </p>
                  )}

                  <p className={`text-sm truncate ${conv.last_message_body ? 'text-neutral-600' : 'text-neutral-400 italic'}`}>
                    {conv.last_message_body || 'No messages yet — start the conversation'}
                  </p>
                </div>

                {(conv.unread_count || 0) > 0 && (
                  <div className="flex-shrink-0 mt-1">
                    <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-primary-500 rounded-full">
                      {conv.unread_count}
                    </span>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
