import { debugLog } from '../utils/sanitization'

type MeetingState = 'WAITING' | 'FIRST_READY' | 'OPENED'

export class MeetingService {
  private state: MeetingState = 'WAITING'
  private alreadyRunningCount = 0
  private pollingInterval: NodeJS.Timeout | null = null
  private abortController: AbortController | null = null

  async waitForMeetingReady(): Promise<void> {
    debugLog('MeetingService: Starting polling...')
    this.state = 'WAITING'
    this.alreadyRunningCount = 0
    return this.pollUntilReady()
  }

  private async callStartJitsi(): Promise<{ status: string }> {
    const backendUrl = import.meta.env.VITE_JITSI_BACKEND_URL
    debugLog(`API: Calling ${backendUrl}/start-jitsi`)

    try {
      const controller = new AbortController()
      this.abortController = controller
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${backendUrl}/start-jitsi`, {
        method: 'POST',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      debugLog('API: Response', data)
      return data
    } catch (error) {
      debugLog('API: Error', error)
      throw error
    }
  }

  private async pollUntilReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let callCount = 0
      const maxCalls = 18 // 18 * 5s = 90s timeout

      const poll = async () => {
        try {
          callCount++
          debugLog(`POLL: Call ${callCount}/${maxCalls}, State: ${this.state}`)

          if (callCount > maxCalls) {
            this.cleanup()
            reject(new Error('Server startup timeout (90 seconds)'))
            return
          }

          const response = await this.callStartJitsi()

          if (response.status === 'already_running') {
            if (this.state === 'WAITING') {
              this.alreadyRunningCount++
              debugLog(`POLL: State transition WAITING → FIRST_READY (skip 1st)`)
              this.state = 'FIRST_READY'
            } else if (this.state === 'FIRST_READY') {
              this.alreadyRunningCount++
              debugLog(`POLL: State transition FIRST_READY → OPENED ✓`)
              this.state = 'OPENED'
              this.cleanup()
              resolve()
              return
            }
          } else if (response.status === 'starting') {
            debugLog(`POLL: Server starting, continuing...`)
          }

          // Schedule next poll
          if (this.pollingInterval) clearInterval(this.pollingInterval)
          this.pollingInterval = setTimeout(poll, 5000)
        } catch (error) {
          this.cleanup()
          reject(error)
        }
      }

      // Start first poll immediately
      poll()
    })
  }

  cleanup(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    debugLog('MeetingService: Cleanup complete')
  }
}
