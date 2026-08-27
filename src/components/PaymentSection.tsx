import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Job, Transaction, PaymentStatus } from '../types'
import { PAYMENT_STATUS_LABELS, TRANSACTION_TYPE_LABELS, TRANSACTION_STATUS_LABELS } from '../types'

interface PaymentSectionProps {
  job: Job
  onJobUpdated: () => void
}

type PaymentType = 'full' | 'deposit' | 'remaining'

export function PaymentSection({ job, onJobUpdated }: PaymentSectionProps) {
  const { profile } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [payLoading, setPayLoading] = useState(false)
  const [depositLoading, setDepositLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [depositMessage, setDepositMessage] = useState('')

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paymentStatus = params.get('payment')
    if (paymentStatus === 'success') {
      setSuccessMsg('Payment successful! Your payment has been processed.')
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

  const agreedAmount = job.agreed_quote_amount || 0
  const paidAmount = Number(job.paid_amount || 0)
  const remainingAmount = Math.max(0, Math.round((agreedAmount - paidAmount) * 100) / 100)
  const depositAmount = Math.round(agreedAmount * 0.50 * 100) / 100

  const handlePay = async (paymentType: PaymentType) => {
    setPayLoading(true)
    setError('')
    setSuccessMsg('')
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
        body: JSON.stringify({ jobId: job.id, paymentType }),
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

      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initiate payment. Please try again.')
      setPayLoading(false)
    }
  }

  const handleRequestDeposit = async () => {
    setDepositLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      const { error: rpcError } = await supabase.rpc('request_deposit', {
        p_job_id: job.id,
        p_message: depositMessage.trim() || null,
      })

      if (rpcError) {
        setError(rpcError.message || 'Could not request deposit.')
        setDepositLoading(false)
        return
      }

      setSuccessMsg('Deposit request sent. The customer has been notified.')
      setShowDepositForm(false)
      setDepositMessage('')
      setDepositLoading(false)
      onJobUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request deposit.')
      setDepositLoading(false)
    }
  }

  if (!agreedAmount || agreedAmount <= 0) {
    return null
  }

  const paymentStatus = job.payment_status as PaymentStatus
  const canPay = isOwner && job.status !== 'cancelled' && paymentStatus !== 'paid' && paymentStatus !== 'disputed' && remainingAmount > 0
  const canRequestDeposit = isAssignedTradie && !job.deposit_requested_at && paymentStatus !== 'paid' && job.status !== 'cancelled'
  const showPayoutStatus = isAssignedTradie && (paymentStatus === 'paid' || paymentStatus === 'partially_paid')
  const payoutTxn = transactions.find((t) => t.type === 'payout')

  const paymentTypeLabel: Record<PaymentType, string> = {
    deposit: `Pay 50% Deposit (${formatAmount(depositAmount)})`,
    remaining: `Pay Remaining Balance (${formatAmount(remainingAmount)})`,
    full: `Pay Full Amount (${formatAmount(remainingAmount)})`,
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-neutral-900">Payment</h3>
        <PaymentStatusBadge status={paymentStatus} />
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Agreed Amount</span>
          <span className="font-medium text-neutral-900">{formatAmount(agreedAmount)}</span>
        </div>
        {paidAmount > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-neutral-500">Paid So Far</span>
              <span className="font-medium text-green-700">{formatAmount(paidAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Remaining Balance</span>
              <span className="font-medium text-neutral-900">{formatAmount(remainingAmount)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <span className="text-neutral-500">Platform Fee (3.5%)</span>
          <span className="font-medium text-neutral-600">{formatAmount(agreedAmount * 0.035)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-100 pt-2">
          <span className="text-neutral-500">Tradie Receives</span>
          <span className="font-medium text-green-700">{formatAmount(agreedAmount * 0.965)}</span>
        </div>
      </div>

      {/* Deposit request banner */}
      {job.deposit_requested_at && (
        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-700 font-medium">
            The tradie has requested a 50% deposit ({formatAmount(depositAmount)}).
          </p>
          {job.deposit_request_message && (
            <p className="text-sm text-blue-600 mt-1">"{job.deposit_request_message}"</p>
          )}
          <p className="text-xs text-blue-500 mt-1">
            Requested on {formatDateTime(job.deposit_requested_at)}
          </p>
        </div>
      )}

      {error && (
        <div className="alert-error mt-4 text-sm">{error}</div>
      )}

      {successMsg && (
        <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* Customer payment buttons */}
      {canPay && (
        <div className="mt-4 space-y-2">
          {job.deposit_requested_at && paidAmount === 0 && (
            <button
              onClick={() => handlePay('deposit')}
              disabled={payLoading}
              className="btn-primary w-full"
            >
              {payLoading ? 'Processing...' : paymentTypeLabel.deposit}
            </button>
          )}
          {paidAmount > 0 && remainingAmount > 0 && (
            <button
              onClick={() => handlePay('remaining')}
              disabled={payLoading}
              className="btn-primary w-full"
            >
              {payLoading ? 'Processing...' : paymentTypeLabel.remaining}
            </button>
          )}
          {paidAmount === 0 && !job.deposit_requested_at && (
            <>
              <button
                onClick={() => handlePay('full')}
                disabled={payLoading}
                className="btn-primary w-full"
              >
                {payLoading ? 'Processing...' : paymentTypeLabel.full}
              </button>
              <button
                onClick={() => handlePay('deposit')}
                disabled={payLoading}
                className="btn-secondary w-full"
              >
                {payLoading ? 'Processing...' : `Pay 50% Deposit (${formatAmount(depositAmount)})`}
              </button>
            </>
          )}
          {paidAmount === 0 && job.deposit_requested_at && (
            <button
              onClick={() => handlePay('full')}
              disabled={payLoading}
              className="btn-secondary w-full"
            >
              {payLoading ? 'Processing...' : `Pay Full Amount (${formatAmount(remainingAmount)})`}
            </button>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            You can pay at any time during the job. A 50% deposit option is available if the tradie requests it or if you prefer to pay in installments.
          </p>
        </div>
      )}

      {/* Tradie deposit request */}
      {canRequestDeposit && !showDepositForm && (
        <div className="mt-4">
          <button
            onClick={() => setShowDepositForm(true)}
            className="btn-secondary w-full text-sm"
          >
            Request 50% Deposit Upfront
          </button>
        </div>
      )}

      {canRequestDeposit && showDepositForm && (
        <div className="mt-4 p-4 rounded-lg bg-neutral-50 border border-neutral-200">
          <h4 className="text-sm font-medium text-neutral-900 mb-2">Request 50% Deposit</h4>
          <p className="text-xs text-neutral-500 mb-3">
            The customer will be notified that you'd like a 50% deposit of {formatAmount(depositAmount)} before starting work.
          </p>
          <textarea
            value={depositMessage}
            onChange={(e) => setDepositMessage(e.target.value)}
            placeholder="Optional message to the customer (e.g. 'I require a deposit to secure materials')"
            rows={3}
            className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRequestDeposit}
              disabled={depositLoading}
              className="btn-primary flex-1 text-sm"
            >
              {depositLoading ? 'Sending...' : 'Send Request'}
            </button>
            <button
              onClick={() => { setShowDepositForm(false); setDepositMessage('') }}
              disabled={depositLoading}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isOwner && paymentStatus === 'unpaid' && job.status === 'assigned' && (
        <p className="text-xs text-neutral-400 mt-2">
          Payment secures this job. The tradie will be notified once payment is received.
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
                    {txn.metadata?.payment_type ? (
                      <span className="text-neutral-400 ml-1">
                        ({String(txn.metadata.payment_type)})
                      </span>
                    ) : null}
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
    partially_paid: 'bg-blue-100 text-blue-700',
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
