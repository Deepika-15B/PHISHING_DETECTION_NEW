# Phishing Website Detector — Extension Verification & Test Log

This document records the end-to-end verification and testing suite performed for the Chrome Extension (Manifest V3).

---

## Test Suite Summary

| Test Case | Description | Expected Result | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-01** | Benign Website Analysis (`https://example.com/`) | Popup reads URL, sends `POST /predict`, receives HTTP 200, displays prediction | `https://example.com/` displayed, `POST /predict` returns `Legitimate` (92.55% confidence, Low risk), model predict called | **PASS** |
| **TEST-02** | Secondary Benign Analysis (`https://google.com/`) | Popup reads URL, sends `POST /predict`, receives HTTP 200 | `POST /predict` returns `Legitimate` (100.0% confidence, Low risk), model predict called | **PASS** |
| **TEST-03** | Chrome Tab URL Detection | Popup retrieves active tab URL on open via `chrome.tabs.query()` | Active tab URL is read automatically and displayed in monospace container | **PASS** |
| **TEST-04** | Backend API Connection | `predictUrl()` sends JSON `{ "url": "<URL>" }` to `http://127.0.0.1:5000/predict` | Flask logs confirm `POST /predict HTTP/1.1 200` received and processed by `UnifiedFeaturePipeline` | **PASS** |
| **TEST-05** | Flask Server Offline Handling | User clicks Analyze when Flask server is offline | Displays "Detection server unavailable" with friendly description without app crash | **PASS** |
| **TEST-06** | Restricted Chrome Pages | Popup opened on `chrome://extensions` or internal pages | Displays "Current page unavailable — Chrome does not provide this page URL to the extension." | **PASS** |
| **TEST-07** | Long URL Text Wrapping | Popup opened on long benign URL | URL wraps cleanly (`word-break: break-all`) within popup container without horizontal overflow | **PASS** |
| **TEST-08** | Dynamic Tab Switching | Switch active tab from Tab A to Tab B and reopen popup | Extension updates and displays Tab B URL dynamically | **PASS** |
| **TEST-09** | Production Build Verification | `npm run build` executed in `browser-extension` | Build succeeds with 0 TypeScript or Vite errors. `dist/` contains bundle assets. CSS: 8.03 kB | **PASS** |
| **TEST-10** | Manifest V3 Schema Check | Validate `dist/manifest.json` | Contains `"manifest_version": 3`, `"permissions": ["activeTab", "storage"]`, `"host_permissions": ["http://127.0.0.1:5000/*"]` | **PASS** |
| **TEST-11** | Scan History Storage | Analyze website and check storage | Scan metadata stored in `chrome.storage.local` and displayed under Recent Scans | **PASS** |
| **TEST-12** | Newest Scans Order | Analyze multiple pages in sequence | Newest scan appears at the top of Recent Scans list | **PASS** |
| **TEST-13** | Max 10 History Records Limit | Perform >10 scans | History array capped at 10 items; 11th scan removes oldest record | **PASS** |
| **TEST-14** | Clear History Button | Click Clear History | `chrome.storage.local` purged, UI immediately updates to empty state | **PASS** |
| **TEST-15** | Persistence Across Popup Reopens | Close popup and reopen | Stored history loaded asynchronously on mount and displayed | **PASS** |
| **TEST-16** | Failed Scan Excluded | API call fails (server offline) | Error displayed; failed attempt is NOT added to history | **PASS** |
| **TEST-17** | SVG Shield Header | Open popup | SVG shield icon renders in accent blue with "AI-powered website security" subtitle | **PASS** |
| **TEST-18** | Security Result Card Title | Analyze any website | Result card shows title "Security Result" (not "Detection Result") | **PASS** |
| **TEST-19** | Confidence Progress Bar | Analyze legitimate site (e.g. 92.55% confidence) | Filled green bar at ~92.55% width; ARIA `progressbar` role and `aria-valuenow` set | **PASS** |
| **TEST-20** | Phishing Confidence Bar Color | Analyze phishing/suspicious URL | Bar fills red (phishing) or amber (suspicious) matching badge color | **PASS** |
| **TEST-21** | Risk Level Badge | Analyze any website | Separate `.risk-badge` shown with Low (green) / Medium (amber) / High (red) color | **PASS** |
| **TEST-22** | Reasons List (Why this result?) | Analyze website that returns `reason[]` array | All reason strings shown as bullet-point list under "WHY THIS RESULT?" heading | **PASS** |
| **TEST-23** | Analyze Again Button | After result appears, click Analyze Again | Re-triggers `handleAnalyze()`, clears previous result and shows new result | **PASS** |
| **TEST-24** | Empty History State | No scans performed yet or after Clear History | Shows "No recent scans" title + "Analyze a website to see your scan history here." | **PASS** |
| **TEST-25** | Accessibility ARIA Labels | Inspect rendered HTML | `aria-label` on Analyze button, `role="progressbar"` with `aria-valuenow/min/max`, `role="alert"` on errors | **PASS** |
| **TEST-26** | Spinner in Button | Click Analyze while request is in flight | Spinner icon appears inside Analyze button alongside "Analyzing website…" text | **PASS** |
| **TEST-27** | API Response Schema Validation | Send malformed / empty JSON response to frontend | `isValidPredictionResponse()` catches malformed schema, rejects corrupted payload, shows user-friendly error without crashing | **PASS** |
| **TEST-28** | Duplicate Click Prevention | Click Analyze multiple times rapidly while request is active | `analyzing` flag and button `disabled` state prevent duplicate requests; exactly 1 API call and 1 history entry generated | **PASS** |
| **TEST-29** | Stale Response Protection | Initiate new scan before prior slow request returns | In-flight request aborted via `AbortController`, sequence ID checked, older response cannot overwrite newer result | **PASS** |
| **TEST-30** | Request Timeout Handling | Simulate server delay exceeding 60-second budget | Request automatically aborted by `AbortController`, spinner clears, button re-enabled, displays "Detection request timed out" | **PASS** |
| **TEST-31** | Connection Refusal / Server Offline | Analyze while Flask is offline (ConnectionRefused) | Error cleanly mapped to "Detection server unavailable" status box; no technical stack trace shown to user | **PASS** |
| **TEST-32** | Restricted URL History Filter | Attempt saving restricted URL to history | `saveScanItem()` explicitly rejects `chrome://`, `chrome-extension://`, `edge://`, `about:` URLs | **PASS** |
| **TEST-33** | Malformed Item Storage Protection | Attempt saving empty or undefined prediction item | `saveScanItem()` validates URL and prediction strings before saving, preventing corrupted history entries | **PASS** |
| **TEST-34** | Storage Exception Resilience | Simulate `chrome.storage.local` failure during save | Storage error caught and logged; prediction result is still rendered successfully in UI | **PASS** |
| **TEST-35** | Production Build & Type Safety | Run `tsc -b && vite build` in `browser-extension` | 0 TypeScript errors, 0 Vite errors; bundle assets generated cleanly in `dist/` (140ms) | **PASS** |

---

## Verified End-to-End Log Output

```text
STATUS CODE: 200
PREDICTION: Legitimate
CONFIDENCE: 92.55
RISK_LEVEL: Low
THREAT_SCORE: 7.4
RESPONSE STATUS: success
MODEL PREDICT CALLED: True
```

Flask Server Log Entry:
```text
127.0.0.1 - - [16/Sep/2026 14:24:37] "POST /predict HTTP/1.1" 200 -
```

