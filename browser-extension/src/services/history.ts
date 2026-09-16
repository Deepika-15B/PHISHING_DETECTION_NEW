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
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to load scan history:', chrome.runtime.lastError)
            resolve([])
            return
          }
          const data = result[STORAGE_KEY]
          if (Array.isArray(data)) {
            resolve(data.slice(0, MAX_HISTORY_SIZE))
          } else {
            resolve([])
          }
        })
      })
    } else {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_SIZE) : []
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
  const newItem: ScanHistoryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: item.timestamp || Date.now(),
  }

  const currentHistory = await getScanHistory()
  const updatedHistory = [newItem, ...currentHistory].slice(0, MAX_HISTORY_SIZE)

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEY]: updatedHistory }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve()
          }
        })
      })
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory))
    }
  } catch (err) {
    console.error('Error saving scan item:', err)
  }

  return updatedHistory
}

export async function clearScanHistory(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.local.remove([STORAGE_KEY], () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve()
          }
        })
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
