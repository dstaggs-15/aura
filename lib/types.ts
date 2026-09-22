export type Profile = {
  id: string
  username: string
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  aura: number
  aura_all_time: number
  streak: number
  last_checkin: string | null
  created_at: string
  is_member: boolean
  notify_new_posts: boolean
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

export type Friendship = {
  id: number
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted'
  created_at: string
  updated_at: string
}

export type Notification = {
  id: number
  user_id: string
  actor_id: string | null
  type: string
  post_id: number | null
  message: string
  read_at: string | null
  created_at: string
}
