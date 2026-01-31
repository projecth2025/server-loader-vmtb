import { useState, useEffect, useRef } from 'react'
import MeetingLoader from '../components/MeetingLoader'
import ErrorPage from '../components/ErrorPage'
import ThankYouPage from '../components/ThankYouPage'
import { MeetingService } from '../services/meetingService'
import { getRoomNameFromUrl, debugLog } from '../utils/sanitization'

type PageState = 'LOADING' | 'READY' | 'ERROR' | 'THANK_YOU'

declare global {
  interface Window {
    JitsiMeetExternalAPI: any
  }
}

export default function MeetingPage() {
  const [state, setState] = useState<PageState>('LOADING')
  const [error, setError] = useState<string>('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const meetingServiceRef = useRef<MeetingService | null>(null)
  const jitsiApiRef = useRef<any>(null)
  const jitsiScriptPromiseRef = useRef<Promise<void> | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const roomName = useRef<string>('')

  // Load Jitsi script dynamically
  const loadJitsiScript = (): Promise<void> => {
    if (jitsiScriptPromiseRef.current) {
      return jitsiScriptPromiseRef.current
    }

    jitsiScriptPromiseRef.current = new Promise((resolve, reject) => {
      const domain = import.meta.env.VITE_JITSI_DOMAIN
      const scriptUrl = `https://${domain}/external_api.js`
      debugLog(`JITSI: Loading script from ${scriptUrl}`)

      const script = document.createElement('script')
      script.src = scriptUrl
      script.async = true
      script.onload = () => {
        debugLog('JITSI: Script loaded successfully')
        resolve()
      }
      script.onerror = () => {
        debugLog('JITSI: Script load failed')
        reject(new Error('Failed to load Jitsi'))
      }
      document.head.appendChild(script)
    })

    return jitsiScriptPromiseRef.current
  }

  // Initialize Jitsi meeting
  const initJitsi = async () => {
    try {
      debugLog('JITSI: Initializing with room:', roomName.current)

      const container = document.getElementById('jitsi-container')
      if (!container) {
        throw new Error('Jitsi container not found')
      }

      const api = new window.JitsiMeetExternalAPI(
        import.meta.env.VITE_JITSI_DOMAIN,
        {
          roomName: roomName.current,
          parentNode: container,
          width: '100%',
          height: '100%',
          configOverwrite: {
            disableSimulcast: false,
            enableWelcomePage: false,
            prejoinPageEnabled: false,
            startAudioMuted: false,
            startVideoMuted: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            HIDE_INVITE_MORE_HEADER: true,
          },
        }
      )

      jitsiApiRef.current = api
      debugLog('JITSI: API ready')

      // Listen for video conference left
      api.addEventListener('videoConferenceLeft', () => {
        debugLog('JITSI: Conference left event')
        handleMeetingEnd()
      })

      // Listen for ready to close
      api.addEventListener('readyToClose', () => {
        debugLog('JITSI: Ready to close event')
        handleMeetingEnd()
      })

      // Participant events (optional)
      api.addEventListener('participantJoined', (participant: any) => {
        debugLog('JITSI: Participant joined:', participant.id)
      })

      api.addEventListener('participantLeft', (participant: any) => {
        debugLog('JITSI: Participant left:', participant.id)
      })

      setState('READY')
    } catch (err) {
      debugLog('JITSI: Error', err)
      throw err
    }
  }

  // Handle meeting end
  const handleMeetingEnd = () => {
    debugLog('MEETING: Meeting ended, showing thank you page...')

    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.dispose()
      } catch (e) {
        debugLog('MEETING: Error disposing Jitsi API', e)
      }
    }

    // Clear container
    const container = document.getElementById('jitsi-container')
    if (container) {
      container.innerHTML = ''
    }

    // Show thank you page
    setState('THANK_YOU')
  }

  // Initialize meeting on mount
  const initMeeting = async () => {
    try {
      debugLog('MEETING: Initializing meeting...')

      // Get room name from URL
      const room = getRoomNameFromUrl()
      if (!room) {
        throw new Error('No room name provided in URL')
      }
      roomName.current = room
      debugLog('MEETING: Room name:', room)

      // Initialize meeting service
      meetingServiceRef.current = new MeetingService()
      await meetingServiceRef.current.waitForMeetingReady()

      debugLog('MEETING: Backend confirmed, redirecting to meet.vmtb.in...')

      // Redirect to meet.vmtb.in with room name
      const jitsiDomain = import.meta.env.VITE_JITSI_DOMAIN
      const meetUrl = `https://${jitsiDomain}/${roomName.current}`
      debugLog('MEETING: Redirecting to:', meetUrl)
      window.location.href = meetUrl
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      debugLog('MEETING: Error during initialization', errorMessage)
      setError(errorMessage)
      setState('ERROR')
    }
  }

  // Handle back button
  const handleBack = () => {
    debugLog('MEETING: User clicked back')
    window.location.href = 'https://vmtb.in'
  }

  // Handle thank you return
  const handleThankYouReturn = () => {
    debugLog('MEETING: User clicked return from thank you')
    window.location.href = 'https://vmtb.in'
  }

  // Render based on state
  if (state === 'LOADING') {
    return <MeetingLoader elapsedSeconds={elapsedSeconds} />
  }

  if (state === 'ERROR') {
    return <ErrorPage error={error} onRetry={handleRetry} onBack={handleBack} />
  }

  if (state === 'THANK_YOU') {
    return <ThankYouPage onBackToApp={handleThankYouReturn} />
  }

  // READY state: This state should not be reached as we redirect to meet.vmtb.in
  return null
}
