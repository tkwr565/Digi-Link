// Utility functions for pin relationship states

/**
 * Pin relationship states (color coding):
 * - 'own' (BLUE) - User's own pin
 * - 'other' (RED) - Other user's pin, no interaction yet
 * - 'messaged' (YELLOW) - Active DM conversation OR pending battle request
 * - 'battled' (GREEN) - Battle confirmed/completed
 */

/**
 * Determine the relationship state between current user and pin owner
 * @param {string} currentUserId - Current user's ID
 * @param {object} pin - Pin object with user_id
 * @param {array} activeConversations - Conversations where underlying pin is still active
 * @param {array} battles - Array of battles between users
 * @returns {string} - Relationship state: 'own' | 'other' | 'messaged' | 'battled'
 */
export const getPinRelationshipState = (currentUserId, pin, activeConversations = [], battles = []) => {
  if (pin.user_id === currentUserId) {
    return 'own'
  }

  const pinOwnerId = pin.user_id

  // Check if battle completed with this user
  const hasCompletedBattle = battles.some(
    battle =>
      battle.battle_completed_at &&
      ((battle.requester_id === currentUserId && battle.responder_id === pinOwnerId) ||
       (battle.requester_id === pinOwnerId && battle.responder_id === currentUserId))
  )

  if (hasCompletedBattle) {
    return 'battled'
  }

  // Check active DM conversation (pin still live)
  const hasActiveConversation = activeConversations.some(
    conv =>
      (conv.user1_id === currentUserId && conv.user2_id === pinOwnerId) ||
      (conv.user1_id === pinOwnerId && conv.user2_id === currentUserId)
  )

  // Check pending battle request
  const hasPendingBattle = battles.some(
    battle =>
      battle.request_status === 'pending' &&
      ((battle.requester_id === currentUserId && battle.responder_id === pinOwnerId) ||
       (battle.requester_id === pinOwnerId && battle.responder_id === currentUserId))
  )

  if (hasActiveConversation || hasPendingBattle) {
    return 'messaged'
  }

  return 'other'
}

/**
 * Get color for relationship state
 * @param {string} state - Relationship state
 * @returns {string} - CSS color variable name
 */
export const getRelationshipColor = (state) => {
  const colorMap = {
    own: '--blue-bright',      // Blue
    other: '--red',            // Red
    messaged: '--amber',       // Yellow/Amber
    battled: '--green-bright'  // Green
  }
  return colorMap[state] || '--red'
}

/**
 * Get relationship state label for UI
 * @param {string} state - Relationship state
 * @returns {string} - Human-readable label
 */
export const getRelationshipLabel = (state) => {
  const labelMap = {
    own: 'Your Pin',
    other: 'Available',
    messaged: 'Contacted',
    battled: 'Battled'
  }
  return labelMap[state] || 'Unknown'
}
