export interface ScanHistoryItem {
  id: string
  url: string
  prediction: string
  confidence?: number
  risk_level?: string
  phishing_probability?: number
  threat_score?: number
  timestamp: number
}

const STORAGE_KEY = 'phishing_scan_history'
const MAX_HISTORY_SIZE = 10

export async function getScanHistory(): Promise<ScanHistoryItem[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (chrome.runtime?.lastError) {
              console.error('Failed to load scan history:', chrome.runtime.lastError)
              resolve([])
              return
            }
            const data = result?.[STORAGE_KEY]
            if (Array.isArray(data)) {
              resolve(data.slice(0, MAX_HISTORY_SIZE))
            } else {
              resolve([])
            }
          })
        } catch (e) {
          console.error('Exception calling chrome.storage.local.get:', e)
          resolve([])
        }
      })
    } else {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_SIZE) : []
        } catch {
          return []
        }
      }
      return []
    }
  } catch (err) {
    console.error('Error reading scan history:', err)
    return []
  }
}

export async function saveScanItem(
  item: Omit<ScanHistoryItem, 'id' | 'timestamp'> & { timestamp?: number }
): Promise<ScanHistoryItem[]> {
  // Validate item before saving
  if (
    !item ||
    typeof item.url !== 'string' ||
    item.url.trim() === '' ||
    typeof item.prediction !== 'string' ||
    item.prediction.trim() === ''
  ) {
    console.warn('Attempted to save invalid scan item to history, ignoring.')
    return await getScanHistory()
  }

  // Prevent saving restricted URLs to scan history
  const url = item.url.trim()
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  ) {
    console.warn('Attempted to save restricted URL to scan history, ignoring.')
    return await getScanHistory()
  }

  const newItem: ScanHistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    url,
    prediction: item.prediction.trim(),
    confidence: typeof item.confidence === 'number' && !isNaN(item.confidence) ? item.confidence : undefined,
    risk_level: typeof item.risk_level === 'string' ? item.risk_level : undefined,
    phishing_probability:
      typeof item.phishing_probability === 'number' && !isNaN(item.phishing_probability)
        ? item.phishing_probability
        : undefined,
    threat_score:
      typeof item.threat_score === 'number' && !isNaN(item.threat_score) ? item.threat_score : undefined,
    timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
  }

  const currentHistory = await getScanHistory()
  const updatedHistory = [newItem, ...currentHistory].slice(0, MAX_HISTORY_SIZE)

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve, reject) => {
        try {
          chrome.storage.local.set({ [STORAGE_KEY]: updatedHistory }, () => {
            if (chrome.runtime?.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          })
        } catch (e) {
          reject(e)
        }
      })
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory))
    }
  } catch (err) {
    console.error('Error saving scan item to storage:', err)
    // Non-fatal: still return updated history in memory
  }

  return updatedHistory
}

export async function clearScanHistory(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve, reject) => {
        try {
          chrome.storage.local.remove([STORAGE_KEY], () => {
            if (chrome.runtime?.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          })
        } catch (e) {
          reject(e)
        }
      })
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (err) {
    console.error('Error clearing scan history:', err)
  }
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const now = new Date()

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()

  const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (isToday) {
    return `Today, ${timeString}`
  }
  if (isYesterday) {
    return `Yesterday, ${timeString}`
  }

  const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${dateString}, ${timeString}`
}

export function formatDisplayUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return (parsed.hostname + parsed.pathname).replace(/\/$/, '')
  } catch {
    return rawUrl
  }
}

