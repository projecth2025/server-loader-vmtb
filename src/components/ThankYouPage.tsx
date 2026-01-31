import { debugLog } from '../utils/sanitization'

interface ThankYouPageProps {
  onBackToApp: () => void
}

export default function ThankYouPage({ onBackToApp }: ThankYouPageProps) {
  debugLog('ThankYouPage: Rendering')

  return (
    <div className="thank-you-container">
      <div className="thank-you-content">
        <div className="thank-you-logo">🏥</div>
        <h1 className="thank-you-title">Thank You</h1>
        <p className="thank-you-message">
          Thank you for conducting the MTB. Visit again!
        </p>
        <button className="thank-you-button" onClick={onBackToApp}>
          Return to App
        </button>
      </div>
    </div>
  )
}
