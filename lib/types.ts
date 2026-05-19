export type Profile = {
  id: string
  username: string
  bio: string | null
  avatar_url: string | null
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