export interface PredictRequest {
  url: string
}

export interface PredictionResponse {
  prediction: string
  confidence?: number
  phishing_probability?: number
  probability?: number
  threat_score?: number
  risk_level?: string
  model_class?: number
  status?: string
  reason?: string[]
  error?: string
  [key: string]: unknown
}

const API_BASE_URL = 'http://127.0.0.1:5000'
const DEFAULT_TIMEOUT_MS = 60000

/**
 * Validates that the received payload matches the expected PredictionResponse structure.
 */
export function isValidPredictionResponse(data: unknown): data is PredictionResponse {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const res = data as Record<string, unknown>

  // Must contain a non-empty prediction string (e.g. "Legitimate", "Phishing", "Suspicious", "Unknown")
  if (typeof res.prediction !== 'string' || res.prediction.trim() === '') {
    return false
  }

  // If confidence is present, must be a valid number
  if (res.confidence !== undefined && (typeof res.confidence !== 'number' || isNaN(res.confidence))) {
    return false
  }

  // If phishing_probability is present, must be a valid number
  if (
    res.phishing_probability !== undefined &&
    (typeof res.phishing_probability !== 'number' || isNaN(res.phishing_probability))
  ) {
    return false
  }

  // If risk_level is present, must be a string
  if (res.risk_level !== undefined && typeof res.risk_level !== 'string') {
    return false
  }

  // If reason is present, must be an array
  if (res.reason !== undefined && !Array.isArray(res.reason)) {
    return false
  }

  return true
}

/**
 * Sends a URL analysis request to the Flask backend with defensive timeout, abort, and error handling.
 */
export async function predictUrl(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<PredictionResponse> {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('Current page unavailable.')
  }

  const controller = new AbortController()
  let isTimedOut = false

  const timeoutId = setTimeout(() => {
    isTimedOut = true
    controller.abort()
  }, timeoutMs)

  // Listen to external signal if provided (e.g., stale request cancellation)
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId)
      throw new Error('Request cancelled.')
    }
    externalSignal.addEventListener(
      'abort',
      () => {
        controller.abort()
      },
      { once: true }
    )
  }

  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: url.trim() }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorDetail = ''
      try {
        const errorData = await response.json()
        if (errorData && typeof errorData === 'object') {
          errorDetail = (errorData.error || errorData.message || '') as string
        }
      } catch {
        // Fallback if response body is not JSON
      }

      if (response.status >= 500) {
        throw new Error(errorDetail || 'Detection server encountered an error. Please try again.')
      }
      throw new Error(errorDetail || `Detection request failed with status ${response.status}.`)
    }

    let rawData: unknown
    try {
      rawData = await response.json()
    } catch {
      throw new Error('Invalid response from detection server. Please try again.')
    }

    if (!isValidPredictionResponse(rawData)) {
      throw new Error('Invalid response from detection server. Please try again.')
    }

    return rawData
  } catch (err: unknown) {
    clearTimeout(timeoutId)

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        if (isTimedOut) {
          throw new Error('Detection request timed out. Please make sure the Flask server is running and try again.')
        }
        throw new Error('Request cancelled.')
      }

      if (
        err.message.includes('Failed to fetch') ||
        err.message.includes('NetworkError') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('Load failed')
      ) {
        throw new Error(
          'Detection server unavailable. Unable to connect to the local detection server. Make sure Flask is running and try again.'
        )
      }

      throw err
    }

    throw new Error('An unexpected error occurred while contacting the detection server.')
  }
}

