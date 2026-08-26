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
  created_at: string
  updated_at: string
}

export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

export type QuotePreference = 'open_to_quotes' | 'fixed_budget'

export type ResponseType = 'quote' | 'interest'

export type QuoteStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'

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
