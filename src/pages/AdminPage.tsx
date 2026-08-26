import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Profile, VerificationStatus } from '../types'

type AdminTab = 'tradies' | 'conversations'

interface ConversationRow {
  id: string
  job_id: string
  customer_id: string
  tradie_id: string
  created_at: string
  job?: { id: string; title: string; status: string }
  customer?: { id: string; email: string; full_name: string | null; business_name: string | null }
  tradie?: { id: string; email: string; full_name: string | null; business_name: string | null }
  message_count?: number
  last_message_at?: string | null
}

interface NotificationActivity {
  type: string
  count: number
}

export function AdminPage() {
  const { profile: adminProfile } = useAuth()
  const [tab, setTab] = useState<AdminTab>('tradies')
  const [tradies, setTradies] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [notificationActivity, setNotificationActivity] = useState<NotificationActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<VerificationStatus | 'all'>('pending')

  const fetchTradies = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('profiles').select('*').eq('role', 'tradie')
    if (filter !== 'all') {
      query = query.eq('verification_status', filter)
    }
    query = query.order('created_at', { ascending: false })
    const { data, error: fetchError } = await query

    if (fetchError) {
      setError('Could not load tradie accounts.')
      setLoading(false)
      return
    }

    setTradies((data || []) as Profile[])
    setError('')
    setLoading(false)
  }, [filter])

  const fetchConversations = useCallback(async () => {
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
      .order('updated_at', { ascending: false })

    if (fetchError) {
      setError('Could not load conversations.')
      setLoading(false)
      return
    }

    const convData = (data || []) as ConversationRow[]

    // Fetch message counts per conversation
    if (convData.length > 0) {
      const convIds = convData.map((c) => c.id)
      const { data: msgData } = await supabase
        .from('messages')
        .select('conversation_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })

      if (msgData) {
        const counts: Record<string, number> = {}
        const lastMsg: Record<string, string> = {}
        for (const msg of msgData) {
          counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1
          if (!lastMsg[msg.conversation_id]) {
            lastMsg[msg.conversation_id] = msg.created_at
          }
        }
        convData.forEach((c) => {
          c.message_count = counts[c.id] || 0
          c.last_message_at = lastMsg[c.id] || null
        })
      }
    }

    setConversations(convData)
    setLoading(false)
  }, [])

  const fetchNotificationActivity = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('type')
      .order('created_at', { ascending: false })
      .limit(100)

    if (data) {
      const counts: Record<string, number> = {}
      for (const n of data) {
        counts[n.type] = (counts[n.type] || 0) + 1
      }
      setNotificationActivity(Object.entries(counts).map(([type, count]) => ({ type, count })))
    }
  }, [])

  useEffect(() => {
    if (tab === 'tradies') {
      fetchTradies()
    } else if (tab === 'conversations') {
      fetchConversations()
      fetchNotificationActivity()
    }
  }, [tab, fetchTradies, fetchConversations, fetchNotificationActivity])

  const updateStatus = async (tradieId: string, status: VerificationStatus) => {
    const { error: fnError } = await supabase.rpc('set_tradie_verification', {
      p_tradie_id: tradieId,
      p_status: status,
    })

    if (fnError) {
      setError('Could not update tradie status. ' + fnError.message)
      return
    }

    fetchTradies()
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-accent-100 text-accent-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      suspended: 'bg-neutral-200 text-neutral-700',
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-neutral-900 mb-2">Admin Panel</h1>
      <p className="text-neutral-600 mb-8">Manage tradie accounts, conversations, and platform activity</p>

      {error && <div className="alert-error mb-6">{error}</div>}

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('tradies')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'tradies'
              ? 'bg-primary-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          Tradie Verification
        </button>
        <button
          onClick={() => setTab('conversations')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'conversations'
              ? 'bg-primary-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          Conversations
        </button>
      </div>

      {/* Tradie verification tab */}
      {tab === 'tradies' && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {(['pending', 'approved', 'rejected', 'suspended', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  filter === f
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Tradie list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : tradies.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-neutral-500">No tradies found with this filter.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tradies.map((tradie) => (
                <div key={tradie.id} className="card p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-neutral-900">{tradie.business_name || tradie.full_name || 'Unnamed'}</h3>
                        {statusBadge(tradie.verification_status)}
                      </div>
                      <p className="text-sm text-neutral-500">{tradie.email}</p>
                      <div className="flex gap-4 text-sm text-neutral-500">
                        {tradie.trade_category && <span>Trade: {tradie.trade_category}</span>}
                        {tradie.abn && <span>ABN: {tradie.abn}</span>}
                        {tradie.phone && <span>Phone: {tradie.phone}</span>}
                      </div>
                      <p className="text-xs text-neutral-400">
                        Joined: {new Date(tradie.created_at).toLocaleDateString('en-AU')}
                      </p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {tradie.verification_status !== 'approved' && (
                        <button
                          onClick={() => updateStatus(tradie.id, 'approved')}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                        >
                          Approve
                        </button>
                      )}
                      {tradie.verification_status !== 'rejected' && (
                        <button
                          onClick={() => updateStatus(tradie.id, 'rejected')}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      )}
                      {tradie.verification_status !== 'suspended' && (
                        <button
                          onClick={() => updateStatus(tradie.id, 'suspended')}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-600 text-white hover:bg-neutral-700 transition-colors"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Conversations tab */}
      {tab === 'conversations' && (
        <>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Conversations list */}
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">All Conversations</h2>
                {conversations.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-neutral-500">No conversations on the platform yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conversations.map((conv) => (
                      <Link
                        key={conv.id}
                        to={`/messages/${conv.id}`}
                        className="card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-neutral-900 truncate">
                              {conv.customer?.full_name || conv.customer?.email || 'Unknown'}
                            </span>
                            <span className="text-neutral-300">↔</span>
                            <span className="font-medium text-neutral-900 truncate">
                              {conv.tradie?.business_name || conv.tradie?.full_name || conv.tradie?.email || 'Unknown'}
                            </span>
                          </div>
                          {conv.job && (
                            <p className="text-xs text-neutral-500 truncate">Re: {conv.job.title}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-medium text-neutral-700">{conv.message_count || 0} messages</p>
                          {conv.last_message_at && (
                            <p className="text-xs text-neutral-400">{formatDate(conv.last_message_at)}</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Notification activity */}
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">Recent Notification Activity</h2>
                {notificationActivity.length === 0 ? (
                  <div className="card p-8 text-center">
                    <p className="text-sm text-neutral-400">No recent notifications.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {notificationActivity.map((item) => (
                      <div key={item.type} className="card p-4">
                        <p className="text-2xl font-bold text-primary-600">{item.count}</p>
                        <p className="text-sm text-neutral-500 capitalize">
                          {item.type.replace(/_/g, ' ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Admin info */}
      <div className="card p-6 mt-8">
        <h3 className="font-semibold text-neutral-900 mb-2">Admin Account</h3>
        <p className="text-sm text-neutral-600">
          Signed in as {adminProfile?.email}. You have full access to manage tradie accounts and view platform activity.
        </p>
      </div>
    </div>
  )
}
