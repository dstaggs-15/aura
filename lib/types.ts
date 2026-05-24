export type Profile = {
  id: string
  username: string
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  aura: number
  streak: number
  last_checkin: string | null
  created_at: string
}

export type Post = {
  id: number
  user_id: string
  text: string
  image_url: string | null
  aura: number
  created_at: string
  profiles?: Profile
}

export type Vote = {
  id: number
  voter_id: string
  post_id: number
  value: number
}

export type ProfileVote = {
  id: number
  voter_id: string
  target_id: string
  value: number
}

export type Comment = {
  id: number
  post_id: number
  user_id: string
  text: string
  created_at: string
  profiles?: Profile
}

export type LedgerEntry = {
  id: number
  user_id: string
  amount: number
  type: string
  description: string | null
  balance_after: number
  created_at: string
}

export type PostTag = {
  id: number
  post_id: number
  tagged_user_id: string
  created_at: string
}