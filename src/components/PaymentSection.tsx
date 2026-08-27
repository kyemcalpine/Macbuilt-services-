import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Job, Transaction, PaymentStatus } from '../types'
import { PAYMENT_STATUS_LABELS, TRANSACTION_TYPE_LABELS, TRANSACTION_STATUS_LABELS } from '../types'

interface PaymentSectionProps {
  job: Job
  onJobUpdated: () => void
}

export function PaymentSection({ job, onJobUpdated }: PaymentSectionProps) {
  const { profile } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [payLoading, setPayLoading] = useState(false)
  const [error, setError] = useState('')

  const isOwner = profile?.id === job.customer_id
  const isAssignedTradie = profile?.id === job.assigned_tradie_id
  const isAdmin = profile?.role === 'admin'

  const fetchTransactions = useCallback(async () => {
    if (!job.id) return
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })
    if (data) setTransactions(data as Transaction[])
  }, [job.id])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Check for payment redirect status in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paymentStatus = params.get('payment')
    if (paymentStatus === 'success') {
      onJobUpdated()
    } else if (paymentStatus === 'cancelled') {
      setError('Payment was cancelled. You can try again.')
    }
  }, [onJobUpdated])

  const formatAmount = (amount: number) =>
    `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const handlePay = async () => {
    setPayLoading(true)
    setError('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) {
        setError('You must be signed in to make a payment.')
        setPayLoading(false)
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobId: job.id }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        const baseMsg = errBody.error || 'Could not initiate payment. Please try again.'
        const diag = errBody.diagnostic
        if (diag && diag.message) {
          setError(`${baseMsg} (${diag.message}${diag.code ? ` — ${diag.code}` : ''}${diag.stage ? ` at ${diag.stage}` : ''})`)
        } else {
          setError(baseMsg)
        }
        setPayLoading(false)
        return
      }

      const { url } = await response.json()
      if (!url) {
        setError('Could not initiate payment. Please try again.')
        setPayLoading(false)
        return
      }

      // Redirect to Stripe Checkout
      window.location.href = url
    } catch (err) {
      console.error('Payment error:', err)
      setError(err instanceof Error ? err.message : 'Could not initiate payment. Please try again.')
      setPayLoading(false)
    }
  }

  if (!job.agreed_quote_amount || job.agreed_quote_amount <= 0) {
    return null
  }

  const paymentStatus = job.payment_status as PaymentStatus
  const showPayButton = isOwner && job.status === 'assigned' && paymentStatus === 'unpaid'
  const showPayoutStatus = isAssignedTradie && paymentStatus === 'paid'
  const payoutTxn = transactions.find((t) => t.type === 'payout')

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-neutral-900">Payment</h3>
        <PaymentStatusBadge status={paymentStatus} />
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Agreed Amount</span>
          <span className="font-medium text-neutral-900">{formatAmount(job.agreed_quote_amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Platform Fee (3.5%)</span>
          <span className="font-medium text-neutral-600">{formatAmount(job.agreed_quote_amount * 0.035)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-100 pt-2">
          <span className="text-neutral-500">Tradie Receives</span>
          <span className="font-medium text-green-700">{formatAmount(job.agreed_quote_amount * 0.965)}</span>
        </div>
      </div>

      {error && (
        <div className="alert-error mt-4 text-sm">{error}</div>
      )}

      {showPayButton && (
        <button
          onClick={handlePay}
          disabled={payLoading}
          className="btn-primary w-full mt-4"
        >
          {payLoading ? 'Processing...' : `Pay ${formatAmount(job.agreed_quote_amount)}`}
        </button>
      )}

      {isOwner && paymentStatus === 'unpaid' && job.status === 'assigned' && (
        <p className="text-xs text-neutral-400 mt-2">
          Payment is required to secure this job. The tradie will be notified once payment is received.
        </p>
      )}

      {showPayoutStatus && (
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Payout Status</span>
            {payoutTxn ? (
              <span className={`font-medium ${
                payoutTxn.status === 'payout_succeeded' ? 'text-green-700' :
                payoutTxn.status === 'payout_failed' ? 'text-red-600' :
                'text-amber-600'
              }`}>
                {TRANSACTION_STATUS_LABELS[payoutTxn.status]}
              </span>
            ) : (
              <span className="text-neutral-400">Pending</span>
            )}
          </div>
          {payoutTxn?.status === 'payout_succeeded' && (
            <p className="text-xs text-green-600 mt-1">
              {formatAmount(payoutTxn.net_amount)} has been sent to your account.
            </p>
          )}
        </div>
      )}

      {paymentStatus === 'disputed' && (
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            A dispute has been raised on this job. An admin will review and resolve it.
          </p>
        </div>
      )}

      {transactions.length > 0 && (isOwner || isAssignedTradie || isAdmin) && (
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <h4 className="text-sm font-medium text-neutral-700 mb-3">Payment History</h4>
          <div className="space-y-2">
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between text-sm py-2 border-b border-neutral-50 last:border-0">
                <div>
                  <span className="font-medium text-neutral-700">
                    {TRANSACTION_TYPE_LABELS[txn.type]}
                  </span>
                  <span className="text-neutral-400 ml-2">
                    {TRANSACTION_STATUS_LABELS[txn.status]}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-medium text-neutral-900">
                    {txn.type === 'refund' ? '-' : ''}{formatAmount(txn.gross_amount)}
                  </p>
                  <p className="text-xs text-neutral-400">{formatDateTime(txn.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const styles: Record<PaymentStatus, string> = {
    unpaid: 'bg-neutral-100 text-neutral-600',
    paid: 'bg-green-100 text-green-700',
    refunded: 'bg-blue-100 text-blue-700',
    partially_refunded: 'bg-amber-100 text-amber-700',
    disputed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  )
}
