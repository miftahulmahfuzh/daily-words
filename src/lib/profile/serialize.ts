import 'server-only'
import type { Profile } from '@/lib/db/types'
import type { ProfileResponse } from '@/lib/profile/schemas'

/**
 * Row → API payload. The one place the mapping lives, so the edit form and the
 * route cannot disagree about what a profile looks like on the wire.
 *
 * `createdAt`, `updatedAt` and `userId` are deliberately not exposed: nothing in
 * v0.1.0 reads them client-side, and a field nobody uses is a field that ends up
 * rendered by accident.
 */
export function toProfileResponse(row: Profile): ProfileResponse {
  return {
    timezone: row.timezone,
    timezoneSource: row.timezoneSource,
    occupation: row.occupation,
    interests: row.interests,
    currentlyConsuming: row.currentlyConsuming,
    englishContexts: row.englishContexts,
    chatTone: row.chatTone,
    birthday: row.birthday,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
  }
}
