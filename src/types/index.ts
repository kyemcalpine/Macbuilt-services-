export type UserRole = 'customer' | 'tradie' | 'admin'

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Profile {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  phone: string | null
  state: string | null
  suburb: string | null
  postcode: string | null
  business_name: string | null
  abn: string | null
  trade_category: string | null
  service_areas: string[] | null
  verification_status: VerificationStatus
  stripe_account_id: string | null
  created_at: string
  updated_at: string
}

export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

export type QuotePreference = 'open_to_quotes' | 'fixed_budget'

export type ResponseType = 'quote' | 'interest'

export type QuoteStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'partially_refunded' | 'disputed'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
  disputed: 'Disputed',
}

export interface Job {
  id: string
  customer_id: string
  title: string
  description: string
  trade_category: string
  status: JobStatus
  budget: number | null
  quote_preference: QuotePreference
  assigned_tradie_id: string | null
  scheduled_date: string | null
  address_line1: string | null
  address_line2: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  notes: string | null
  tradie_completed_at: string | null
  customer_confirmed_at: string | null
  agreed_quote_amount: number | null
  payment_status: PaymentStatus
  stripe_payment_intent_id: string | null
  created_at: string
  updated_at: string
  customer?: Pick<Profile, 'id' | 'email' | 'full_name' | 'phone' | 'state' | 'suburb' | 'postcode'>
  assigned_tradie?: Pick<Profile, 'id' | 'email' | 'full_name' | 'phone' | 'business_name' | 'trade_category' | 'verification_status' | 'state' | 'suburb' | 'postcode'>
}

export interface JobQuote {
  id: string
  job_id: string
  tradie_id: string
  response_type: ResponseType
  amount: number | null
  message: string
  notes: string | null
  estimated_start_date: string | null
  estimated_duration: string | null
  status: QuoteStatus
  created_at: string
  updated_at: string
  tradie?: Pick<Profile, 'id' | 'email' | 'full_name' | 'phone' | 'business_name' | 'trade_category' | 'verification_status' | 'state' | 'suburb' | 'postcode'>
}

export interface JobNote {
  id: string
  job_id: string
  author_id: string
  note: string
  created_at: string
  updated_at: string
  author?: Pick<Profile, 'id' | 'email' | 'full_name' | 'role' | 'business_name'>
}

export const JOB_STATUSES: JobStatus[] = ['open', 'assigned', 'in_progress', 'completed', 'cancelled']

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const VALID_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['cancelled'],
  completed: [],
  cancelled: [],
}

export const QUOTE_STATUSES: QuoteStatus[] = ['pending', 'accepted', 'rejected', 'withdrawn']

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  quote: 'Quote',
  interest: 'Expression of Interest',
}

export const QUOTE_PREFERENCE_LABELS: Record<QuotePreference, string> = {
  open_to_quotes: 'Open to Quotes',
  fixed_budget: 'Fixed Budget / No Quotes',
}

export type AttachmentType = 'job_photo' | 'progress_photo' | 'completion_photo' | 'additional_photo'

export interface JobAttachment {
  id: string
  job_id: string
  uploaded_by: string
  attachment_type: AttachmentType
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  caption: string | null
  created_at: string
  uploader?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>
}

export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  job_photo: 'Job Photos',
  progress_photo: 'Progress Photos',
  completion_photo: 'Completion Photos',
  additional_photo: 'Additional Photos',
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export type NotificationType =
  | 'new_quote'
  | 'new_interest'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'job_assigned'
  | 'new_message'
  | 'job_status_changed'
  | 'new_job_note'
  | 'job_completion_confirmed'
  | 'new_review'
  | 'new_job_attachment'
  | 'payment_required'
  | 'payment_received'
  | 'payment_failed'
  | 'refund_processed'
  | 'payout_processed'
  | 'dispute_raised'
  | 'dispute_resolved'

export interface JobReview {
  id: string
  job_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
  reviewer?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'business_name'>
  reviewee?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'business_name'>
  job?: Pick<Job, 'id' | 'title'>
}

export interface Conversation {
  id: string
  job_id: string
  customer_id: string
  tradie_id: string
  created_at: string
  updated_at: string
  job?: Pick<Job, 'id' | 'title' | 'status'>
  customer?: Pick<Profile, 'id' | 'email' | 'full_name' | 'business_name'>
  tradie?: Pick<Profile, 'id' | 'email' | 'full_name' | 'business_name'>
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  read_at: string | null
  created_at: string
  sender?: Pick<Profile, 'id' | 'email' | 'full_name' | 'role' | 'business_name'>
}

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  job_id: string | null
  conversation_id: string | null
  read_at: string | null
  created_at: string
}

export const NOTIFICATION_TYPES: NotificationType[] = [
  'new_quote',
  'new_interest',
  'quote_accepted',
  'quote_rejected',
  'job_assigned',
  'new_message',
  'job_status_changed',
  'new_job_note',
  'job_completion_confirmed',
  'new_review',
  'new_job_attachment',
  'payment_required',
  'payment_received',
  'payment_failed',
  'refund_processed',
  'payout_processed',
  'dispute_raised',
  'dispute_resolved',
]

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  new_quote: 'New Quote',
  new_interest: 'New Interest',
  quote_accepted: 'Quote Accepted',
  quote_rejected: 'Quote Rejected',
  job_assigned: 'Job Assigned',
  new_message: 'New Message',
  job_status_changed: 'Job Status Changed',
  new_job_note: 'New Job Note',
  job_completion_confirmed: 'Completion Confirmed',
  new_review: 'New Review',
  new_job_attachment: 'New Photo',
  payment_required: 'Payment Required',
  payment_received: 'Payment Received',
  payment_failed: 'Payment Failed',
  refund_processed: 'Refund Processed',
  payout_processed: 'Payout Sent',
  dispute_raised: 'Dispute Raised',
  dispute_resolved: 'Dispute Resolved',
}

export type ActivityType =
  | 'job_created'
  | 'status_changed'
  | 'quote_submitted'
  | 'interest_expressed'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'quote_withdrawn'
  | 'note_added'
  | 'photo_uploaded'
  | 'message_sent'
  | 'review_submitted'
  | 'completion_requested'
  | 'completion_confirmed'
  | 'payment_initiated'
  | 'payment_received'
  | 'payment_failed'
  | 'refund_processed'
  | 'payout_processed'
  | 'dispute_raised'
  | 'dispute_resolved'

export interface JobActivity {
  id: string
  job_id: string
  activity_type: ActivityType
  actor_id: string | null
  detail: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'business_name'> | null
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  job_created: 'Job Posted',
  status_changed: 'Status Updated',
  quote_submitted: 'Quote Submitted',
  interest_expressed: 'Interest Expressed',
  quote_accepted: 'Quote Accepted',
  quote_rejected: 'Quote Rejected',
  quote_withdrawn: 'Quote Withdrawn',
  note_added: 'Note Added',
  photo_uploaded: 'Photo Uploaded',
  message_sent: 'Message Sent',
  review_submitted: 'Review Submitted',
  completion_requested: 'Completion Requested',
  completion_confirmed: 'Completion Confirmed',
  payment_initiated: 'Payment Initiated',
  payment_received: 'Payment Received',
  payment_failed: 'Payment Failed',
  refund_processed: 'Refund Processed',
  payout_processed: 'Payout Sent',
  dispute_raised: 'Dispute Raised',
  dispute_resolved: 'Dispute Resolved',
}

export const STAR_RATINGS = [1, 2, 3, 4, 5] as const

export const AUSTRALIAN_STATES = [
  'NSW',
  'VIC',
  'QLD',
  'WA',
  'SA',
  'TAS',
  'ACT',
  'NT',
] as const

export const TRADE_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Carpentry',
  'Building',
  'Landscaping',
  'Gardening',
  'Cleaning',
  'Painting',
  'Tiling',
  'Roofing',
  'Concreting',
  'Fencing',
  'Handyman',
  'Air Conditioning',
  'Pest Control',
  'Rubbish Removal',
  'Moving',
  'Automotive',
  'Property Maintenance',
  'Other Services',
] as const

export type TransactionType = 'payment' | 'refund' | 'payout'

export type TransactionStatus =
  | 'pending'
  | 'requires_payment'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'payout_pending'
  | 'payout_succeeded'
  | 'payout_failed'

export interface Transaction {
  id: string
  job_id: string
  customer_id: string
  tradie_id: string | null
  type: TransactionType
  gross_amount: number
  platform_fee: number
  net_amount: number
  stripe_payment_intent_id: string | null
  stripe_transfer_id: string | null
  stripe_refund_id: string | null
  status: TransactionStatus
  failure_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  job?: Pick<Job, 'id' | 'title'>
  customer?: Pick<Profile, 'id' | 'email' | 'full_name'>
  tradie?: Pick<Profile, 'id' | 'email' | 'full_name' | 'business_name'>
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  payment: 'Payment',
  refund: 'Refund',
  payout: 'Payout',
}

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: 'Pending',
  requires_payment: 'Awaiting Payment',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
  disputed: 'Disputed',
  payout_pending: 'Payout Pending',
  payout_succeeded: 'Payout Sent',
  payout_failed: 'Payout Failed',
}

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_full_refund'
  | 'resolved_partial_refund'
  | 'resolved_no_refund'
  | 'cancelled'

export interface Dispute {
  id: string
  job_id: string
  raised_by: string
  raised_by_role: 'customer' | 'tradie'
  reason: string
  status: DisputeStatus
  resolver_id: string | null
  resolution_notes: string | null
  refund_amount: number | null
  raised_at: string
  resolved_at: string | null
  job?: Pick<Job, 'id' | 'title'>
  raiser?: Pick<Profile, 'id' | 'email' | 'full_name' | 'role' | 'business_name'>
  resolver?: Pick<Profile, 'id' | 'email' | 'full_name' | 'role'> | null
}

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  resolved_full_refund: 'Resolved — Full Refund',
  resolved_partial_refund: 'Resolved — Partial Refund',
  resolved_no_refund: 'Resolved — No Refund',
  cancelled: 'Cancelled',
}
