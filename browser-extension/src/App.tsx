import { useEffect, useState, useRef } from 'react'
import { predictUrl, type PredictionResponse } from './services/api'
import {
  getScanHistory,
  saveScanItem,
  clearScanHistory,
  formatTimestamp,
  formatDisplayUrl,
  type ScanHistoryItem,
} from './services/history'

function App() {
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [tabLoading, setTabLoading] = useState<boolean>(true)
  const [tabError, setTabError] = useState<string>('')

  const [analyzing, setAnalyzing] = useState<boolean>(false)
  const [apiError, setApiError] = useState<string>('')
  const [result, setResult] = useState<PredictionResponse | null>(null)

  const [history, setHistory] = useState<ScanHistoryItem[]>([])

  // Tracking refs for stale request cancellation and duplicate prevention
  const requestIdRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // 1. Detect current active tab URL
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs: chrome.tabs.Tab[]) => {
          const tab = tabs[0]

          if (!tab || !tab.url) {
            setTabError('restricted')
            setTabLoading(false)
            return
          }

          const url = tab.url.trim()

          if (
            url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('edge://') ||
            url.startsWith('about:') ||
            url === ''
          ) {
            setTabError('restricted')
            setTabLoading(false)
            return
          }

          setCurrentUrl(url)
          setTabLoading(false)
        }
      )
    } else {
      setTabError('restricted')
      setTabLoading(false)
    }

    // 2. Load scan history from local storage
    getScanHistory()
      .then((items) => setHistory(items))
      .catch((err) => {
        console.error('Failed to load history on popup init:', err)
        setHistory([])
      })

    // Cleanup in-flight requests on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleAnalyze = async () => {
    // Prevent duplicate requests and restricted/invalid URL scans
    if (!currentUrl || tabError || analyzing) return

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    const currentRequestId = ++requestIdRef.current

    setAnalyzing(true)
    setApiError('')
    setResult(null)

    try {
      const response = await predictUrl(currentUrl, 60000, controller.signal)

      // Stale response check: ignore if a newer request superseded this one
      if (currentRequestId !== requestIdRef.current) {
        return
      }

      setResult(response)

      // Save valid API response to local storage history
      if (response.prediction && typeof response.prediction === 'string') {
        try {
          const updatedHistory = await saveScanItem({
            url: currentUrl,
            prediction: response.prediction,
            confidence: response.confidence,
            risk_level: response.risk_level,
            phishing_probability: response.phishing_probability,
            threat_score: typeof response.threat_score === 'number' ? response.threat_score : undefined,
          })
          if (currentRequestId === requestIdRef.current) {
            setHistory(updatedHistory)
          }
        } catch (storageErr) {
          console.error('History storage error (non-fatal):', storageErr)
        }
      }
    } catch (err: unknown) {
      // Stale response check: ignore errors if request was cancelled or superseded
      if (currentRequestId !== requestIdRef.current) {
        return
      }

      if (err instanceof Error) {
        if (err.message === 'Request cancelled.') {
          return
        }
        setApiError(err.message)
      } else {
        setApiError('An unexpected error occurred.')
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setAnalyzing(false)
      }
    }
  }

  const handleClearHistory = async () => {
    try {
      await clearScanHistory()
    } catch (err) {
      console.error('Error clearing history:', err)
    }
    setHistory([])
  }

  const getPredictionClass = (prediction?: string) => {
    switch (prediction?.toLowerCase()) {
      case 'legitimate': return 'badge-legitimate'
      case 'phishing':   return 'badge-phishing'
      case 'suspicious': return 'badge-suspicious'
      default:           return 'badge-unknown'
    }
  }

  const getRiskClass = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case 'low':    return 'risk-low'
      case 'medium': return 'risk-medium'
      case 'high':   return 'risk-high'
      default:       return 'risk-unknown'
    }
  }

  const getConfidenceBarClass = (prediction?: string) => {
    switch (prediction?.toLowerCase()) {
      case 'legitimate': return 'confidence-fill--legitimate'
      case 'phishing':   return 'confidence-fill--phishing'
      case 'suspicious': return 'confidence-fill--suspicious'
      default:           return 'confidence-fill--unknown'
    }
  }

  const formatPhishingProb = (prob?: number) => {
    if (typeof prob !== 'number' || isNaN(prob)) return null
    return `${(prob * 100).toFixed(1)}%`
  }

  const confidencePct =
    typeof result?.confidence === 'number' && !isNaN(result.confidence)
      ? Math.min(100, Math.max(0, result.confidence))
      : 0

  const renderApiErrorBox = () => {
    if (!apiError || analyzing) return null

    let title = 'Detection server unavailable'
    let desc = 'Unable to connect to the local detection server. Make sure Flask is running and try again.'

    if (apiError.includes('timed out') || apiError.includes('timeout')) {
      title = 'Detection request timed out'
      desc = 'Please make sure the Flask server is running and try again.'
    } else if (apiError.includes('Invalid response')) {
      title = 'Invalid server response'
      desc = 'Received an unexpected or malformed response from the detection server. Please try again.'
    } else if (apiError.includes('Current page unavailable')) {
      title = 'Current page unavailable'
      desc = 'Chrome does not provide this page URL to the extension.'
    } else if (apiError.includes('status') || apiError.includes('encountered an error')) {
      title = 'Detection server error'
      desc = apiError
    }

    return (
      <div className="status-box status-box--error api-error-box" role="alert">
        <p className="status-title">{title}</p>
        <p className="status-desc">{desc}</p>
      </div>
    )
  }

  return (
    <div className="popup-container">
      {/* ── Header ── */}
      <header className="popup-header">
        <div className="header-shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shield-svg">
            <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6L12 2z"
              fill="currentColor" opacity="0.15" />
            <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6L12 2z"
              stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="header-text">
          <h1>Phishing Detector</h1>
          <p className="header-subtitle">AI-powered website security</p>
        </div>
      </header>

      <main className="popup-content">

        {/* ── Current Website Card ── */}
        <section className="section" aria-label="Current Website">
          <h2 className="section-title">Current Website</h2>

          {tabLoading && (
            <div className="status-box status-box--info" role="status">
              <p>Reading current tab…</p>
            </div>
          )}

          {tabError === 'restricted' && (
            <div className="status-box status-box--warning" role="alert">
              <p className="status-title">Current page unavailable</p>
              <p className="status-desc">
                Chrome does not provide this page URL to the extension.
              </p>
            </div>
          )}

          {!tabLoading && !tabError && (
            <>
              <div className="url-container" aria-label="Current URL">
                <p className="url-text">{currentUrl}</p>
              </div>

              <button
                type="button"
                className="analyze-button"
                onClick={handleAnalyze}
                disabled={analyzing || !currentUrl}
                aria-label="Analyze current website for phishing"
                aria-busy={analyzing}
              >
                {analyzing ? (
                  <><span className="spinner" aria-hidden="true" /> Analyzing website…</>
                ) : (
                  'Analyze Website'
                )}
              </button>
            </>
          )}
        </section>

        {/* ── API / Connection Error ── */}
        {renderApiErrorBox()}

        {/* ── Security Result Card ── */}
        {result && !analyzing && (
          <section className="section result-section" aria-label="Security Result">
            <h2 className="section-title">Security Result</h2>

            {/* Prediction badge + confidence label */}
            <div className="result-hero">
              <span className={`badge badge-lg ${getPredictionClass(result.prediction)}`}>
                {result.prediction || 'Unknown'}
              </span>
              {typeof result.confidence === 'number' && !isNaN(result.confidence) && (
                <span className="confidence-label">
                  {result.confidence.toFixed(1)}% confidence
                </span>
              )}
            </div>

            {/* Confidence progress bar */}
            {typeof result.confidence === 'number' && !isNaN(result.confidence) && (
              <div
                className="confidence-bar"
                role="progressbar"
                aria-valuenow={confidencePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Confidence: ${result.confidence.toFixed(1)}%`}
              >
                <div
                  className={`confidence-fill ${getConfidenceBarClass(result.prediction)}`}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            )}

            {/* Detail rows */}
            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">Risk Level</span>
                <span className={`risk-badge ${getRiskClass(result.risk_level)}`}>
                  {result.risk_level || 'Unknown'}
                </span>
              </div>

              {typeof result.phishing_probability === 'number' && !isNaN(result.phishing_probability) && (
                <div className="result-item">
                  <span className="result-label">Phishing Probability</span>
                  <span className="result-value">{formatPhishingProb(result.phishing_probability)}</span>
                </div>
              )}

              {typeof result.threat_score === 'number' && !isNaN(result.threat_score) && (
                <div className="result-item">
                  <span className="result-label">Threat Score</span>
                  <span className="result-value">{result.threat_score.toFixed(1)} / 100</span>
                </div>
              )}

              <div className="result-item url-result-item">
                <span className="result-label">Analyzed URL</span>
                <span className="result-value-url" title={currentUrl}>
                  {formatDisplayUrl(currentUrl)}
                </span>
              </div>
            </div>

            {/* Why this result? */}
            {result.reason && Array.isArray(result.reason) && result.reason.length > 0 && (
              <div className="reasons-container">
                <p className="reasons-heading">Why this result?</p>
                <ul className="reasons-list" aria-label="Detection reasons">
                  {result.reason.map((r, i) => (
                    <li key={i} className="reasons-item">{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Analyze Again */}
            <button
              type="button"
              className="analyze-again-button"
              onClick={handleAnalyze}
              disabled={analyzing}
              aria-label="Analyze this website again"
            >
              Analyze Again
            </button>
          </section>
        )}

        {/* ── Recent Scans History ── */}
        <section className="section history-section" aria-label="Recent Scans">
          <div className="section-header">
            <h2 className="section-title">Recent Scans</h2>
            {history.length > 0 && (
              <button
                type="button"
                className="clear-history-button"
                onClick={handleClearHistory}
                aria-label="Clear scan history"
              >
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="empty-history">
              <p className="empty-history-title">No recent scans</p>
              <p className="empty-history-desc">Analyze a website to see your scan history here.</p>
            </div>
          ) : (
            <ul className="history-list" aria-label="Scan history">
              {history.map((item) => (
                <li key={item.id} className="history-item">
                  <div className="history-item-top">
                    <span className="history-url" title={item.url}>
                      {formatDisplayUrl(item.url)}
                    </span>
                    <span className={`badge badge-sm ${getPredictionClass(item.prediction)}`}>
                      {item.prediction}
                    </span>
                  </div>
                  <div className="history-item-bottom">
                    <span className="history-details">
                      {typeof item.confidence === 'number' && !isNaN(item.confidence)
                        ? `${item.confidence.toFixed(1)}% confidence`
                        : ''}
                      {item.risk_level ? ` · ${item.risk_level} Risk` : ''}
                    </span>
                    <span className="history-time">{formatTimestamp(item.timestamp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>
    </div>
  )
}

export default App
