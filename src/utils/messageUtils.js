// Message utility functions for DM system

/**
 * Get the other user's ID in a conversation
 */
export const getOtherUserId = (conversation, currentUserId) => {
  return conversation.user1_id === currentUserId
    ? conversation.user2_id
    : conversation.user1_id
}

/**
 * Check if current user has unread messages in conversation
 */
export const hasUnread = (conversation, currentUserId) => {
  return conversation.user1_id === currentUserId
    ? conversation.user1_has_unread
    : conversation.user2_has_unread
}

/**
 * Format timestamp for message list (relative time)
 */
export const formatMessageTime = (timestamp) => {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return then.toLocaleDateString()
}

/**
 * Format timestamp for message bubble (full time)
 */
export const formatMessageTimestamp = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Get or create conversation between two users for a specific pin
 * Returns { data: conversation, error: null } or { data: null, error: error }
 */
export const getOrCreateConversation = async (currentUserId, otherUserId, pinId, supabase) => {
  // Sort user IDs alphabetically for consistency
  const [user1_id, user2_id] = [currentUserId, otherUserId].sort()

  // Check if conversation exists for this pin
  const { data: existing, error: fetchError } = await supabase
    .from('conversations')
    .select('*')
    .eq('pin_id', pinId)
    .eq('user1_id', user1_id)
    .eq('user2_id', user2_id)
    .single()

  if (existing) {
    return { data: existing, error: null }
  }

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = no rows returned (expected when conversation doesn't exist)
    return { data: null, error: fetchError }
  }

  // Create new conversation
  const { data: newConv, error: createError } = await supabase
    .from('conversations')
    .insert({
      pin_id: pinId,
      user1_id,
      user2_id,
      user1_has_unread: false,
      user2_has_unread: false
    })
    .select()
    .single()

  return { data: newConv, error: createError }
}

/**
 * Mark all unread messages in a conversation as read
 */
export const markConversationAsRead = async (conversationId, currentUserId, supabase) => {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('to_user_id', currentUserId)
    .is('read_at', null)

  if (error) {
    console.error('Error marking messages as read:', error)
  }

  // Clear the unread flag on the conversation for the current user.
  // Two targeted updates — only the one where currentUserId matches will affect a row.
  await supabase
    .from('conversations')
    .update({ user1_has_unread: false })
    .eq('id', conversationId)
    .eq('user1_id', currentUserId)

  await supabase
    .from('conversations')
    .update({ user2_has_unread: false })
    .eq('id', conversationId)
    .eq('user2_id', currentUserId)
}

/**
 * Send a message in a conversation
 */
export const sendMessage = async (conversationId, fromUserId, toUserId, pinId, content, supabase) => {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      pin_id: pinId,
      content: content.trim()
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Check if user has existing battle request for a pin
 * Returns { data: battle, error: null } if found, { data: null, error: null } if not found
 */
export const getBattleRequestForPin = async (requesterId, pinId, supabase) => {
  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .eq('requester_id', requesterId)
    .eq('pin_id', pinId)
    .maybeSingle()

  return { data, error }
}

/**
 * Create a battle request for a pin
 * Returns { data: battle, error: null } on success
 */
export const createBattleRequest = async (requesterId, responderId, pinId, supabase) => {
  const { data, error } = await supabase
    .from('battles')
    .insert({
      requester_id: requesterId,
      responder_id: responderId,
      pin_id: pinId,
      request_status: 'pending'
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Accept a battle request and create conversation
 * Returns { data: { battle, conversation }, error: null } on success
 */
export const acceptBattleRequest = async (battleId, pinId, user1Id, user2Id, supabase, pinTitle = null) => {
  // Load the battle request to determine who is requester
  const { data: battle, error: battleFetchError } = await supabase
    .from('battles')
    .select('requester_id, responder_id')
    .eq('id', battleId)
    .single()

  if (battleFetchError) {
    return { data: null, error: battleFetchError }
  }

  // Sort user IDs for conversation
  const [sortedUser1, sortedUser2] = [user1Id, user2Id].sort()

  // Determine which sorted user is the requester (should get notification)
  // The requester gets unread=true since the responder is accepting and creating the conversation
  const user1IsRequester = sortedUser1 === battle.requester_id
  const user1HasUnread = user1IsRequester // Requester gets notification
  const user2HasUnread = !user1IsRequester // Responder doesn't (they're the one accepting)

  // Create conversation first
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      pin_id: pinId,
      user1_id: sortedUser1,
      user2_id: sortedUser2,
      user1_has_unread: user1HasUnread,
      user2_has_unread: user2HasUnread,
      pin_title_snapshot: pinTitle
    })
    .select()
    .single()

  if (convError) {
    return { data: null, error: convError }
  }

  // Update battle request to accepted and link to conversation
  const { data: updatedBattle, error: battleError } = await supabase
    .from('battles')
    .update({
      request_status: 'accepted',
      request_accepted_at: new Date().toISOString(),
      conversation_id: conversation.id
    })
    .eq('id', battleId)
    .select()
    .single()

  if (battleError) {
    return { data: null, error: battleError }
  }

  return { data: { battle: updatedBattle, conversation }, error: null }
}

/**
 * Toggle battle completion confirmation for current user
 * Returns { data: battle, error: null } on success
 */
export const toggleBattleConfirmation = async (battleId, userId, isRequester, supabase) => {
  const columnToUpdate = isRequester ? 'requester_confirmed' : 'responder_confirmed'

  // Get current state
  const { data: currentBattle, error: fetchError } = await supabase
    .from('battles')
    .select('requester_confirmed, responder_confirmed')
    .eq('id', battleId)
    .single()

  if (fetchError) {
    return { data: null, error: fetchError }
  }

  // Toggle the confirmation
  const newValue = !currentBattle[columnToUpdate]

  const { data, error } = await supabase
    .from('battles')
    .update({ [columnToUpdate]: newValue })
    .eq('id', battleId)
    .select()
    .single()

  return { data, error }
}

/**
 * Get battle record for a conversation
 * Returns { data: battle, error: null } if found
 */
export const getBattleForConversation = async (conversationId, supabase) => {
  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('request_status', 'accepted')
    .maybeSingle()

  return { data, error }
}
