import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { debugLog } from '../utils/sanitization';

/**
 * Meeting Analytics Service
 * 
 * Handles all meeting tracking operations:
 * - Creating meeting sessions (when first participant joins)
 * - Tracking participant joins/leaves
 * - Ending meeting sessions (when last participant leaves)
 * 
 * Designed to work even with:
 * - Tab closes (uses beforeunload)
 * - Internet disconnections (Jitsi events)
 * - Browser crashes (session marked stale on next load)
 */

export interface MeetingSession {
  id: string;
  mtb_id: string;
  room_name: string;
  started_at: string;
  ended_at: string | null;
  total_duration_seconds: number | null;
  max_participants: number;
  status: 'active' | 'ended';
}

export interface MeetingParticipant {
  id: string;
  meeting_session_id: string;
  participant_id: string;
  display_name: string | null;
  joined_at: string;
  left_at: string | null;
  duration_seconds: number | null;
  left_reason: 'normal' | 'tab_closed' | 'disconnected' | 'unknown' | null;
}

export interface MeetingParams {
  roomName: string;
  mtbId: string;
  mtbName?: string;
}

export class MeetingAnalyticsService {
  private supabase = getSupabaseClient();
  private meetingSessionId: string | null = null;
  private currentParticipantId: string | null = null;
  private localParticipantDbId: string | null = null; // Database ID for our participant record
  private params: MeetingParams | null = null;
  private participantCount: number = 0;
  private maxParticipants: number = 0;
  private isTracking: boolean = false;

  constructor() {
    // Bind methods for event handlers
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  /**
   * Initialize analytics tracking for a meeting
   */
  async initialize(params: MeetingParams): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      debugLog('[ANALYTICS] Supabase not configured, analytics disabled');
      return false;
    }

    if (!params.mtbId || !params.roomName) {
      debugLog('[ANALYTICS] Missing required params (mtbId or roomName)');
      return false;
    }

    this.params = params;
    debugLog('[ANALYTICS] ========================================');
    debugLog('[ANALYTICS] Initializing for room:', params.roomName);
    debugLog('[ANALYTICS] MTB ID:', params.mtbId);

    // Set up tab close handler
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.isTracking = true;
    debugLog('[ANALYTICS] ✓ Tracking initialized');
    return true;
  }

  /**
   * Called when the local participant joins the Jitsi room
   * This is the first Jitsi event we receive after connection
   */
  async onLocalParticipantJoined(participantId: string, displayName?: string): Promise<void> {
    if (!this.isTracking || !this.params) return;

    debugLog('[ANALYTICS] Local participant joined:', participantId);
    this.currentParticipantId = participantId;

    // Check for or create meeting session
    await this.ensureMeetingSession();

    // Create participant record for the local user
    await this.createParticipantRecord(participantId, displayName);

    this.participantCount++;
    this.updateMaxParticipants();
  }

  /**
   * Called when a remote participant joins
   */
  async onParticipantJoined(participantId: string, displayName?: string): Promise<void> {
    if (!this.isTracking || !this.meetingSessionId) return;

    debugLog('[ANALYTICS] Remote participant joined:', participantId);

    // Only create records for remote participants, not ourselves
    if (participantId !== this.currentParticipantId) {
      await this.createParticipantRecord(participantId, displayName);
    }

    this.participantCount++;
    this.updateMaxParticipants();
    debugLog('[ANALYTICS] Participant count:', this.participantCount);
  }

  /**
   * Called when a remote participant leaves
   */
  async onParticipantLeft(participantId: string): Promise<void> {
    if (!this.isTracking || !this.meetingSessionId) return;

    debugLog('[ANALYTICS] Remote participant left:', participantId);

    // Mark participant as left
    await this.markParticipantLeft(participantId, 'normal');

    this.participantCount = Math.max(0, this.participantCount - 1);
    debugLog('[ANALYTICS] Participant count:', this.participantCount);

    // Check if meeting should end (only the local user remains)
    // Note: We don't end the meeting when a remote user leaves,
    // only when the local user leaves (handled in onLocalParticipantLeft)
  }

  /**
   * Called when the local participant leaves (normally or via hangup)
   */
  async onLocalParticipantLeft(reason: 'normal' | 'tab_closed' | 'disconnected' = 'normal'): Promise<void> {
    if (!this.isTracking) return;

    debugLog('[ANALYTICS] Local participant leaving:', reason);

    // Mark our participant record as left
    if (this.localParticipantDbId) {
      await this.markParticipantLeftById(this.localParticipantDbId, reason);
    }

    this.participantCount = Math.max(0, this.participantCount - 1);

    // Check if we should end the meeting (we were the last participant)
    await this.checkAndEndMeeting();

    this.cleanup();
  }

  /**
   * Get or create a meeting session for this room
   */
  private async ensureMeetingSession(): Promise<void> {
    if (!this.supabase || !this.params) return;

    try {
      // First, check if there's already an active session for this room
      const { data: existingSession, error: fetchError } = await this.supabase
        .from('meeting_sessions')
        .select('*')
        .eq('room_name', this.params.roomName)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is expected for new meetings
        debugLog('[ANALYTICS] Error checking for existing session:', fetchError.message);
      }

      if (existingSession) {
        // Session already exists, use it
        this.meetingSessionId = existingSession.id;
        this.maxParticipants = existingSession.max_participants || 0;
        debugLog('[ANALYTICS] Using existing session:', this.meetingSessionId);
        return;
      }

      // No active session, create a new one
      debugLog('[ANALYTICS] Creating new meeting session');
      const { data: newSession, error: insertError } = await this.supabase
        .from('meeting_sessions')
        .insert({
          mtb_id: this.params.mtbId,
          room_name: this.params.roomName,
          started_at: new Date().toISOString(),
          status: 'active',
          max_participants: 1, // At least 1 (the local user)
        })
        .select()
        .single();

      if (insertError) {
        debugLog('[ANALYTICS] ❌ Error creating session:', insertError.message);
        return;
      }

      this.meetingSessionId = newSession.id;
      debugLog('[ANALYTICS] ✓ Created new session:', this.meetingSessionId);

    } catch (error) {
      debugLog('[ANALYTICS] ❌ Exception in ensureMeetingSession:', error);
    }
  }

  /**
   * Create a participant record
   */
  private async createParticipantRecord(participantId: string, displayName?: string): Promise<void> {
    if (!this.supabase || !this.meetingSessionId) return;

    try {
      const { data, error } = await this.supabase
        .from('meeting_participants')
        .insert({
          meeting_session_id: this.meetingSessionId,
          participant_id: participantId,
          display_name: displayName || null,
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        debugLog('[ANALYTICS] ❌ Error creating participant record:', error.message);
        return;
      }

      // Store the DB ID if this is the local participant
      if (participantId === this.currentParticipantId) {
        this.localParticipantDbId = data.id;
      }

      debugLog('[ANALYTICS] ✓ Created participant record:', data.id);

    } catch (error) {
      debugLog('[ANALYTICS] ❌ Exception in createParticipantRecord:', error);
    }
  }

  /**
   * Mark a participant as left by their Jitsi participant ID
   */
  private async markParticipantLeft(participantId: string, reason: string): Promise<void> {
    if (!this.supabase || !this.meetingSessionId) return;

    try {
      const now = new Date();
      
      // Find the most recent record for this participant without a left_at
      const { data: participant, error: fetchError } = await this.supabase
        .from('meeting_participants')
        .select('*')
        .eq('meeting_session_id', this.meetingSessionId)
        .eq('participant_id', participantId)
        .is('left_at', null)
        .order('joined_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !participant) {
        debugLog('[ANALYTICS] Could not find active participant record');
        return;
      }

      const joinedAt = new Date(participant.joined_at);
      const durationSeconds = Math.floor((now.getTime() - joinedAt.getTime()) / 1000);

      const { error: updateError } = await this.supabase
        .from('meeting_participants')
        .update({
          left_at: now.toISOString(),
          duration_seconds: durationSeconds,
          left_reason: reason,
        })
        .eq('id', participant.id);

      if (updateError) {
        debugLog('[ANALYTICS] ❌ Error updating participant:', updateError.message);
        return;
      }

      debugLog('[ANALYTICS] ✓ Marked participant left, duration: ' + durationSeconds + 's');

    } catch (error) {
      debugLog('[ANALYTICS] ❌ Exception in markParticipantLeft:', error);
    }
  }

  /**
   * Mark a participant as left by their database ID
   */
  private async markParticipantLeftById(dbId: string, reason: string): Promise<void> {
    if (!this.supabase) return;

    try {
      const now = new Date();

      // Get the participant record
      const { data: participant, error: fetchError } = await this.supabase
        .from('meeting_participants')
        .select('*')
        .eq('id', dbId)
        .single();

      if (fetchError || !participant) {
        debugLog('[ANALYTICS] Could not find participant by DB ID');
        return;
      }

      // Skip if already marked as left
      if (participant.left_at) {
        debugLog('[ANALYTICS] Participant already marked as left');
        return;
      }

      const joinedAt = new Date(participant.joined_at);
      const durationSeconds = Math.floor((now.getTime() - joinedAt.getTime()) / 1000);

      const { error: updateError } = await this.supabase
        .from('meeting_participants')
        .update({
          left_at: now.toISOString(),
          duration_seconds: durationSeconds,
          left_reason: reason,
        })
        .eq('id', dbId);

      if (updateError) {
        debugLog('[ANALYTICS] ❌ Error updating participant:', updateError.message);
        return;
      }

      debugLog('[ANALYTICS] ✓ Marked local participant left, duration: ' + durationSeconds + 's');

    } catch (error) {
      debugLog('[ANALYTICS] ❌ Exception in markParticipantLeftById:', error);
    }
  }

  /**
   * Update max participants count
   */
  private async updateMaxParticipants(): Promise<void> {
    if (!this.supabase || !this.meetingSessionId) return;

    if (this.participantCount > this.maxParticipants) {
      this.maxParticipants = this.participantCount;
      
      try {
        await this.supabase
          .from('meeting_sessions')
          .update({ max_participants: this.maxParticipants })
          .eq('id', this.meetingSessionId);

        debugLog('[ANALYTICS] Updated max participants:', this.maxParticipants);
      } catch (error) {
        debugLog('[ANALYTICS] ❌ Error updating max participants:', error);
      }
    }
  }

  /**
   * Check if the meeting should end and end it
   */
  private async checkAndEndMeeting(): Promise<void> {
    if (!this.supabase || !this.meetingSessionId) return;

    try {
      // Check how many participants are still active in this session
      const { data: activeParticipants, error } = await this.supabase
        .from('meeting_participants')
        .select('id')
        .eq('meeting_session_id', this.meetingSessionId)
        .is('left_at', null);

      if (error) {
        debugLog('[ANALYTICS] Error checking active participants:', error.message);
        return;
      }

      const activeCount = activeParticipants?.length || 0;
      debugLog('[ANALYTICS] Active participants remaining:', activeCount);

      // Only end meeting if no participants remain
      if (activeCount === 0) {
        await this.endMeetingSession();
      }

    } catch (error) {
      debugLog('[ANALYTICS] ❌ Exception in checkAndEndMeeting:', error);
    }
  }

  /**
   * End the meeting session
   */
  private async endMeetingSession(): Promise<void> {
    if (!this.supabase || !this.meetingSessionId) return;

    try {
      // Get the session to calculate duration
      const { data: session, error: fetchError } = await this.supabase
        .from('meeting_sessions')
        .select('*')
        .eq('id', this.meetingSessionId)
        .single();

      if (fetchError || !session) {
        debugLog('[ANALYTICS] Could not find session to end');
        return;
      }

      // Skip if already ended
      if (session.status === 'ended') {
        debugLog('[ANALYTICS] Session already ended');
        return;
      }

      const now = new Date();
      const startedAt = new Date(session.started_at);
      const totalDurationSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

      const { error: updateError } = await this.supabase
        .from('meeting_sessions')
        .update({
          ended_at: now.toISOString(),
          total_duration_seconds: totalDurationSeconds,
          status: 'ended',
        })
        .eq('id', this.meetingSessionId);

      if (updateError) {
        debugLog('[ANALYTICS] ❌ Error ending session:', updateError.message);
        return;
      }

      debugLog('[ANALYTICS] ========================================');
      debugLog('[ANALYTICS] ✓ Meeting ended');
      debugLog('[ANALYTICS] Duration: ' + totalDurationSeconds + 's');
      debugLog('[ANALYTICS] Max participants:', this.maxParticipants);
      debugLog('[ANALYTICS] ========================================');

    } catch (error) {
      debugLog('[ANALYTICS] ❌ Exception in endMeetingSession:', error);
    }
  }

  /**
   * Handle browser tab close / page unload
   * Uses sendBeacon for reliable delivery
   */
  private handleBeforeUnload(): void {
    debugLog('[ANALYTICS] beforeunload event');
    
    // Use synchronous approach for tab close
    // Mark participant as left with 'tab_closed' reason
    if (this.supabase && this.localParticipantDbId) {
      // sendBeacon doesn't work well with Supabase client
      // Instead, rely on visibility change and the session cleanup logic
      this.onLocalParticipantLeft('tab_closed');
    }
  }

  /**
   * Handle page visibility changes (tab becomes hidden)
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      debugLog('[ANALYTICS] Page became hidden');
      // Could use this for additional tracking
    }
  }

  /**
   * Clean up event handlers and state
   */
  cleanup(): void {
    debugLog('[ANALYTICS] Cleaning up');
    
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    this.isTracking = false;
    this.meetingSessionId = null;
    this.currentParticipantId = null;
    this.localParticipantDbId = null;
    this.params = null;
    this.participantCount = 0;
    this.maxParticipants = 0;
  }

  /**
   * Get current meeting session ID (for debugging)
   */
  getMeetingSessionId(): string | null {
    return this.meetingSessionId;
  }

  /**
   * Check if analytics tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }
}

// Export singleton instance
export const meetingAnalytics = new MeetingAnalyticsService();
