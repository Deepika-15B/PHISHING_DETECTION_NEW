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
2. Click the **Phishing Website Detector** shield icon in the Chrome toolbar.
3. The popup automatically reads and displays the active tab URL.
4. Click **Analyze Website**.
5. The extension sends a `POST /predict` request to the backend. While processing, the button displays "Analyzing website...".
6. The prediction result card appears displaying the classification, confidence score, risk level, phishing probability, and threat score (if returned by backend).
7. Successful scans are automatically recorded in **Recent Scans**.

---

## Recent Scans & Local Storage

The extension features a lightweight local scan history stored asynchronously in `chrome.storage.local`:

- **Capacity:** Stores up to a maximum of **10 records**. When an 11th scan occurs, the oldest record is automatically removed.
- **Privacy & Security:** Only non-sensitive scan metadata (`url`, `prediction`, `confidence`, `risk_level`, `phishing_probability`, `threat_score`, `timestamp`) is saved. No cookies, page source, credentials, or browsing history are ever collected or stored.
- **Clear History:** Users can click **Clear History** in the extension popup to instantly remove all stored scans from `chrome.storage.local`.

---

## Expected Prediction Outcomes

- **Legitimate:** Website classified as safe with high probability (green badge).
- **Phishing:** Website classified as suspicious or malicious based on extracted URL/HTML features (red badge).
- **Suspicious:** Borderline feature patterns requiring user caution (amber badge).
- **Unknown:** Returned when a website is unreachable, incomplete, or protected by anti-bot challenge pages (e.g. Cloudflare / AWS WAF) (neutral badge).

---

## Error Handling

- **Flask Server Offline:** Displays `"Unable to connect to the detection server."` (no history entry created).
- **Request Timeout:** 60-second limit via `AbortController`. Displays `"Analysis timed out. Please make sure the Flask detection server is running and try again."`
- **Restricted Chrome Pages:** Chrome internal pages (`chrome://`, `chrome-extension://`, `about:`) display `"Current tab URL is unavailable."` without calling the API or creating history records.

---

## Evaluation & Disclaimer

The detection capabilities are powered by the project's trained Feedforward Neural Network (FNN) evaluated on standard phishing benchmarks. Documented performance is based on the project's evaluated test dataset and does not constitute a 100% guarantee for every real-world URL.
