import animeAvatar from '../assets/avatars/anime.png'
import clayAvatar from '../assets/avatars/clay.png'
import vectorAvatar from '../assets/avatars/vector.png'
import y2kAvatar from '../assets/avatars/y2k.png'

export const BUILTIN_PROFILE_AVATAR_PREFIX = 'mycinema-avatar:'

export const DEFAULT_AVATARS = [
  { id: 'anime', src: animeAvatar, label: 'Anime Cyberpunk' },
  { id: 'clay', src: clayAvatar, label: '3D Claymorphism' },
  { id: 'vector', src: vectorAvatar, label: 'Minimalist Vector' },
  { id: 'y2k', src: y2kAvatar, label: 'Y2K Retro' },
] as const

export type BuiltinProfileAvatarId = typeof DEFAULT_AVATARS[number]['id']

export function getBuiltinProfileAvatarId(value: string | null | undefined): BuiltinProfileAvatarId | null {
  if (!value) return null

  const prefixedId = value.startsWith(BUILTIN_PROFILE_AVATAR_PREFIX)
    ? value.slice(BUILTIN_PROFILE_AVATAR_PREFIX.length)
    : null
  const match = DEFAULT_AVATARS.find((avatar) => {
    if (prefixedId) return avatar.id === prefixedId
    // Recognize old Vite paths and hashed production asset URLs so existing
    // profiles migrate to a build-independent avatar ID.
    return new RegExp(`(?:^|[/\\\\])${avatar.id}(?:--[^/\\\\?#]+)?\\.png(?:[?#].*)?$`, 'i').test(value)
  })

  return match?.id ?? null
}

export function normalizeProfileImage(value: string | null | undefined): string | null | undefined {
  const avatarId = getBuiltinProfileAvatarId(value)
  return avatarId ? `${BUILTIN_PROFILE_AVATAR_PREFIX}${avatarId}` : value
}

export function resolveProfileImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const avatarId = getBuiltinProfileAvatarId(value)
  return avatarId
    ? DEFAULT_AVATARS.find((avatar) => avatar.id === avatarId)?.src ?? value
    : value
}
