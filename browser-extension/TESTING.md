# Phishing Website Detector — Extension Verification & Test Log

This document records the end-to-end verification and testing suite performed for the Chrome Extension (Manifest V3).

---

## Test Suite Summary

| Test Case | Description | Expected Result | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-01** | Benign Website Analysis (`https://example.com/`) | Popup reads URL, sends `POST /predict`, receives HTTP 200 response, displays prediction | `https://example.com/` displayed, `POST /predict` returns `Legitimate` (92.55% confidence, Low risk), model predict called | **PASS** |
| **TEST-02** | Secondary Benign Analysis (`https://google.com/`) | Popup reads URL, sends `POST /predict`, receives HTTP 200 response | `https://google.com/` displayed, `POST /predict` returns `Legitimate` (100.0% confidence, Low risk), model predict called | **PASS** |
| **TEST-03** | Chrome Tab URL Detection | Popup retrieves active tab URL on open via `chrome.tabs.query()` | Active tab URL is read automatically and displayed in monospace container | **PASS** |
| **TEST-04** | Backend API Connection | `predictUrl()` sends JSON `{ "url": "<URL>" }` to `http://127.0.0.1:5000/predict` | Flask logs confirm `POST /predict HTTP/1.1 200` received and processed by `UnifiedFeaturePipeline` | **PASS** |
| **TEST-05** | Flask Server Offline Handling | User clicks Analyze when Flask server is offline | Displays user-friendly error: `"Unable to connect to the detection server."` without app crash | **PASS** |
| **TEST-06** | Restricted Chrome Pages | Popup opened on `chrome://extensions` or internal pages | Displays `"Current tab URL is unavailable."` and disables API call | **PASS** |
| **TEST-07** | Long URL Text Wrapping | Popup opened on long benign URL | URL wraps cleanly (`word-break: break-all`) within 350px container without horizontal overflow | **PASS** |
| **TEST-08** | Dynamic Tab Switching | Switch active tab from Tab A to Tab B and reopen popup | Extension updates and displays Tab B URL dynamically | **PASS** |
| **TEST-09** | Production Build Verification | `npm run build` executed in `browser-extension` | Build succeeds cleanly with 0 TypeScript or Vite errors. `dist/` contains bundle assets | **PASS** |
| **TEST-10** | Manifest V3 Schema Check | Validate `dist/manifest.json` | Contains `"manifest_version": 3`, `"permissions": ["activeTab", "storage"]`, `"host_permissions": ["http://127.0.0.1:5000/*"]` | **PASS** |
| **TEST-11** | Scan History Storage | Analyze website and check storage | Scan metadata stored in `chrome.storage.local` and displayed under Recent Scans | **PASS** |
| **TEST-12** | Newest Scans Order | Analyze multiple pages in sequence | Newest scan appears at the top of Recent Scans list | **PASS** |
| **TEST-13** | Max 10 History Records Limit | Perform >10 scans | History array is capped at 10 items; 11th scan purges the oldest record | **PASS** |
| **TEST-14** | Clear History Button | Click Clear History | `chrome.storage.local` purged, UI immediately updates to `"No recent scans."` | **PASS** |
| **TEST-15** | Persistence Across Popup Reopens | Close popup and reopen | Stored history loaded asynchronously on mount and displayed | **PASS** |
| **TEST-16** | Failed Scan Excluded | API call fails (e.g. server offline) | Error displayed; failed attempt is NOT added to history | **PASS** |

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
