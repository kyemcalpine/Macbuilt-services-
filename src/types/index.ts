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
