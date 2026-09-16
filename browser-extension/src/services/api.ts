export interface PredictionResponse {
  prediction?: string
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

export async function predictUrl(url: string, timeoutMs = 60000): Promise<PredictionResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorText = ''
      try {
        const errorData = await response.json()
        errorText = errorData.error || errorData.message || ''
      } catch {
        // Fallback if response body is not JSON
      }
      throw new Error(errorText || `Prediction request failed with status ${response.status}`)
    }

    const data: PredictionResponse = await response.json()
    return data
  } catch (err: unknown) {
    clearTimeout(timeoutId)

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('Analysis timed out. Please make sure the Flask detection server is running and try again.')
      }
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        throw new Error('Unable to connect to the detection server.')
      }
      throw err
    }

    throw new Error('An unexpected error occurred while contacting the detection server.')
  }
}
