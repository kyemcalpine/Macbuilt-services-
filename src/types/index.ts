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

export interface Job {
  id: string
  customer_id: string
  title: string
  description: string
  trade_category: string
  status: JobStatus
  budget: number | null
  scheduled_date: string | null
  address_line1: string | null
  address_line2: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customer?: Pick<Profile, 'id' | 'email' | 'full_name' | 'phone' | 'state' | 'suburb' | 'postcode'>
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
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

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
