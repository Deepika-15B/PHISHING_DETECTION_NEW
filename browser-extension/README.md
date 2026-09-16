# Phishing Website Detector — Chrome Extension

A user-facing Chrome Extension (Manifest V3) built with React, TypeScript, and Vite that connects to an existing machine learning Flask backend to analyze and detect phishing websites in real-time.

---

## Architecture & System Flow

> **Important Note:** The extension acts purely as a frontend deployment interface. All machine learning models, feature extraction pipelines, and classification logic reside securely on the Flask backend.

```
Chrome Tab
    ↓
chrome.tabs.query() (active tab URL)
    ↓
React Extension Popup UI
    ↓
POST http://127.0.0.1:5000/predict ({ "url": "<current tab URL>" })
    ↓
Flask Backend API (backend/app.py)
    ↓
UnifiedFeaturePipeline (URL + Playwright rendered HTML extraction)
    ↓
Top-20 Selected Features (top20_features.pkl)
    ↓
StandardScaler (scaler_phase2_v2.pkl)
    ↓
Feedforward Neural Network (fnn_phase2_v2.keras)
    ↓
JSON Prediction Payload
    ↓
React Popup Display (Prediction, Confidence, Risk Level, Phishing Prob., Threat Score)
    ↓
Local Scan History (chrome.storage.local — max 10 records)
```

---

## Requirements

- **Browser:** Google Chrome (or Chromium-based browser supporting Manifest V3)
- **Node.js:** v18.0.0 or higher (with npm)
- **Backend:** Python 3.10+ environment with Flask, TensorFlow, Playwright, and project dependencies installed

---

## Installation & Setup

### 1. Build the Extension Frontend

Navigate to the `browser-extension` folder and install dependencies:

```bash
cd E:\phishing_project_ieee\phishing_detection_extension\browser-extension
npm install
```

Build the production extension bundle:

```bash
npm run build
```

This compiles the React/TypeScript app into the `browser-extension/dist` directory.

### 2. Load into Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked**.
4. Select the directory:
   `E:\phishing_project_ieee\phishing_detection_extension\browser-extension\dist`
5. The extension **Phishing Website Detector** will now appear in your toolbar.

### 3. Start the Flask Backend Server

From the root project folder:

```bash
cd E:\phishing_project_ieee\phishing_detection_extension
python backend/app.py
```

Confirm that the server is running locally at `http://127.0.0.1:5000`.

---

## Using the Extension

1. Navigate to any website in Chrome (e.g. `https://example.com/`).
2. Click the **Phishing Detector** shield icon in the Chrome toolbar.
3. The popup automatically reads and displays the active tab URL.
4. Click **Analyze Website**.
5. While the backend processes the URL, the button shows a spinner: *"Analyzing website…"*
6. The **Security Result** card appears with:
   - **Prediction badge** (Legitimate / Phishing / Suspicious / Unknown) with semantic colour coding
   - **Confidence progress bar** whose fill colour matches the prediction
   - **Risk Level** badge (Low / Medium / High / Unknown)
   - **Phishing Probability** as a percentage
   - **Threat Score** as *X / 100* (only shown when returned by the backend)
   - **Analyzed URL** in monospace
   - **Why this result?** — bullet list of reasons returned by the backend
   - **Analyze Again** button to re-scan the same page
7. Successful scans are automatically saved to **Recent Scans**.

---

## Recent Scans & Local Storage

The extension stores scan history in `chrome.storage.local`:

- **Capacity:** Maximum of **10 records**. When an 11th scan occurs the oldest record is automatically removed.
- **Privacy & Security:** Only non-sensitive scan metadata (`url`, `prediction`, `confidence`, `risk_level`, `phishing_probability`, `threat_score`, `timestamp`) is stored. No cookies, page source, credentials, or full browsing history are collected.
- **Empty state:** Displays *"No recent scans / Analyze a website to see your scan history here."* when history is empty.
- **Clear History:** Click **Clear History** to instantly purge all stored records from `chrome.storage.local`.

---

## Expected Prediction Outcomes

| Prediction | Badge Colour | Meaning |
|:---|:---|:---|
| **Legitimate** | Green | Classified as safe |
| **Phishing** | Red | High-risk / malicious indicators detected |
| **Suspicious** | Amber | Borderline patterns — proceed with caution |
| **Unknown** | Grey | Unreachable, incomplete, or bot-protected page |

---

## Error Handling

| Scenario | Displayed Message |
|:---|:---|
| Flask server offline | *"Detection server unavailable — Make sure the Flask server is running at http://127.0.0.1:5000 and try again."* |
| 60-second timeout | *"Analysis timed out. Please make sure the Flask detection server is running and try again."* |
| Restricted Chrome page | *"Current page unavailable — Chrome does not provide this page URL to the extension."* |

---

## Reliability & State Handling (Step 9)

The extension includes defensive reliability measures:

- **API Response Validation:** All responses from `/predict` are strictly validated (`isValidPredictionResponse`) before rendering in the UI. If a payload is malformed or missing key fields, the extension safely rejects it with a user-friendly message and avoids adding corrupt data to history.
- **Request Timeout Handling:** 60-second execution budget enforced via `AbortController`. If exceeded, the request aborts, the loading spinner clears, buttons re-enable, and a clear timeout notification is displayed.
- **Duplicate Request Prevention:** The *Analyze* and *Analyze Again* buttons are disabled immediately upon click (`aria-busy="true"`). Repeated clicks while a request is in flight are ignored to prevent concurrent duplicate backend calls.
- **Stale Response Protection:** Every analysis request is tagged with an incremental sequence ID and abort signal. If a new analysis begins or the user switches context, in-flight requests are aborted and older responses cannot overwrite newer results.
- **Network & Server Offline Handling:** Connection errors (server down, connection refused, CORS/fetch failures) are mapped to structured, actionable messages (`"Detection server unavailable"`).
- **History & Storage Safety:** History entries require a valid URL and prediction string before saving. Restricted URLs (`chrome://`, `chrome-extension://`, `edge://`, `about:`) and failed requests are strictly barred from history. Storage exceptions are caught gracefully so history errors never break prediction display.
- **No Automatic Retries:** One click produces exactly one request to avoid spamming the backend or generating duplicate scans.

---

## Step 10 — Final End-to-End Verification

The Chrome Manifest V3 extension has been verified for production demonstration readiness:

- **Production Build:** `npm run build` compiles cleanly into `dist/` with 0 TypeScript and 0 Vite errors.
- **Manifest V3 Package:** `dist/manifest.json` conforms strictly to Manifest V3 specifications with minimal required permissions (`activeTab`, `storage`) and explicit host permissions (`http://127.0.0.1:5000/*`).
- **Chrome Extension Loading:** The unpacked extension in `dist/` loads into Google Chrome (`chrome://extensions`) without manifest warnings or console exceptions.
- **Flask API & ML Integration:** Live end-to-end communication verified with `POST http://127.0.0.1:5000/predict` serving the protected Feedforward Neural Network (FNN) and Top-20 HTML/URL feature pipeline.
- **Security Result Card:** Renders live backend predictions, confidence levels, per-prediction colored progress bar, risk levels, and explanation reasons with zero hardcoding or probability distortion.
- **State & History Safety:** Recent scans persist in `chrome.storage.local` (capped at 10 items) with single-click purge. In-flight requests are protected against stale overwrites and duplicate submissions.
- **Error & Offline Handling:** Connection refusal, 60s timeout, malformed payloads, and internal browser pages (`chrome://`) are cleanly handled with clear notifications.
- **Protected System Integrity:** All backend files (`backend/`, `models/`, `utils/`, datasets) and the original benchmark repository remained 100% untouched.

---

## Evaluation & Disclaimer

Detection is powered by the project's trained Feedforward Neural Network (FNN). Performance figures are based on the project's evaluated test dataset. This extension does **not** claim 100% protection against all phishing attempts.


