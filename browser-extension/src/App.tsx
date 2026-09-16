import { useEffect, useState } from 'react'
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

  useEffect(() => {
    // 1. Detect current active tab URL
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs: chrome.tabs.Tab[]) => {
          const tab = tabs[0]

          if (!tab || !tab.url) {
            setTabError('Current tab URL is unavailable.')
            setTabLoading(false)
            return
          }

          const url = tab.url

          if (
            url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('edge://') ||
            url.startsWith('about:')
          ) {
            setTabError('Current tab URL is unavailable.')
            setTabLoading(false)
            return
          }

          setCurrentUrl(url)
          setTabLoading(false)
        }
      )
    } else {
      setTabError('Unable to detect current tab URL.')
      setTabLoading(false)
    }

    // 2. Load scan history from local storage
    getScanHistory()
      .then((items) => setHistory(items))
      .catch((err) => console.error('Failed to load history on popup init:', err))
  }, [])

  const handleAnalyze = async () => {
    if (!currentUrl || tabError || analyzing) return

    setAnalyzing(true)
    setApiError('')
    setResult(null)

    try {
      const response = await predictUrl(currentUrl)
      setResult(response)

      // Save valid API response to local storage history
      if (response.prediction) {
        const updatedHistory = await saveScanItem({
          url: currentUrl,
          prediction: response.prediction,
          confidence: response.confidence,
          risk_level: response.risk_level,
          phishing_probability: response.phishing_probability,
          threat_score: typeof response.threat_score === 'number' ? response.threat_score : undefined,
        })
        setHistory(updatedHistory)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message)
      } else {
        setApiError('An unexpected error occurred.')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const handleClearHistory = async () => {
    await clearScanHistory()
    setHistory([])
  }

  const getPredictionClass = (prediction?: string) => {
    switch (prediction?.toLowerCase()) {
      case 'legitimate':
        return 'badge-legitimate'
      case 'phishing':
        return 'badge-phishing'
      case 'suspicious':
        return 'badge-suspicious'
      default:
        return 'badge-unknown'
    }
  }

  // Format phishing probability as percentage if present
  const formatPhishingProb = (prob?: number) => {
    if (typeof prob !== 'number') return null
    const pct = (prob * 100).toFixed(1)
    return `${pct}%`
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <span className="header-icon" role="img" aria-label="shield">🛡️</span>
        <h1>Phishing Website Detector</h1>
      </header>

      <main className="popup-content">
        {/* Section 1: Current Website */}
        <section className="section">
          <h2>Current Website</h2>

          {tabLoading && (
            <div className="status-box loading">
              <p>Reading current tab...</p>
            </div>
          )}

          {tabError && (
            <div className="status-box error">
              <p>{tabError}</p>
            </div>
          )}

          {!tabLoading && !tabError && (
            <>
              <div className="url-container">
                <p className="url-text">{currentUrl}</p>
              </div>

              <button
                type="button"
                className="analyze-button"
                onClick={handleAnalyze}
                disabled={analyzing || !currentUrl}
              >
                {analyzing ? 'Analyzing website...' : 'Analyze Website'}
              </button>
            </>
          )}
        </section>

        {/* Loading Indicator */}
        {analyzing && (
          <div className="status-box loading analyzing-box">
            <div className="spinner" />
            <p>Analyzing website...</p>
          </div>
        )}

        {/* API Error Box */}
        {apiError && !analyzing && (
          <div className="status-box error api-error-box">
            <p>{apiError}</p>
          </div>
        )}

        {/* Section 2: Detection Result Card */}
        {result && !analyzing && (
          <section className="section result-section">
            <h2>Detection Result</h2>

            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">Prediction</span>
                <span className={`badge ${getPredictionClass(result.prediction)}`}>
                  {result.prediction || 'Unknown'}
                </span>
              </div>

              <div className="result-item">
                <span className="result-label">Confidence</span>
                <span className="result-value">
                  {typeof result.confidence === 'number' ? `${result.confidence}%` : 'N/A'}
                </span>
              </div>

              <div className="result-item">
                <span className="result-label">Risk Level</span>
                <span className="result-value">
                  {result.risk_level || 'Unknown'}
                </span>
              </div>

              {typeof result.phishing_probability === 'number' && (
                <div className="result-item">
                  <span className="result-label">Phishing Prob.</span>
                  <span className="result-value">
                    {formatPhishingProb(result.phishing_probability)}
                  </span>
                </div>
              )}

              {typeof result.threat_score === 'number' && (
                <div className="result-item">
                  <span className="result-label">Threat Score</span>
                  <span className="result-value">
                    {result.threat_score} / 100
                  </span>
                </div>
              )}

              <div className="result-item url-result-item">
                <span className="result-label">Analyzed URL</span>
                <span className="result-value-url" title={currentUrl}>
                  {formatDisplayUrl(currentUrl)}
                </span>
              </div>
            </div>

            {result.reason && Array.isArray(result.reason) && result.reason.length > 0 && (
              <div className="reason-container">
                <p className="reason-text">{result.reason[0]}</p>
              </div>
            )}
          </section>
        )}

        {/* Section 3: Recent Scans History */}
        <section className="section history-section">
          <div className="section-header">
            <h2>Recent Scans</h2>
            {history.length > 0 && (
              <button
                type="button"
                className="clear-history-button"
                onClick={handleClearHistory}
              >
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="no-history-text">No recent scans.</p>
          ) : (
            <ul className="history-list">
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
                      {typeof item.confidence === 'number' ? `${item.confidence}% confidence` : ''}
                      {item.risk_level ? ` • ${item.risk_level} Risk` : ''}
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
