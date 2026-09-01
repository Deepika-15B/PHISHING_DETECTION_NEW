# Phase 2 v2 Model Evaluation

## Dataset

- Dataset name: PhiUSIIL `Dataset_HTML.csv`, processed Phase 2 v2 split.
- Test sample count: 35,185
- Phishing count (label 0): 14,957
- Legitimate count (label 1): 20,228
- Test split source: `data/processed_v2/test.csv`; deterministic 70/15/15 stratified split with `random_state=42` from `phase2_preprocess_phiusiil.py`.
- The v2 training script uses `train.csv` for fit, `validation.csv` only for validation monitoring, and this `test.csv` only for evaluation.

## Model

- Model: `fnn_phase2_v2.keras`
- Architecture: Dense(64, ReLU) → Dropout(0.20) → Dense(32, ReLU) → Dropout(0.20) → Dense(1, Sigmoid).
- Feature count: 20
- Selected features: URLSimilarityIndex, NoOfExternalRef, LineOfCode, NoOfSelfRef, IsHTTPS, NoOfImage, NoOfJS, HasSocialNet, NoOfCSS, HasCopyrightInfo, NoOfOtherSpecialCharsInURL, LargestLineLength, HasDescription, NoOfDegitsInURL, URLLength, IsResponsive, DegitRatioInURL, DomainTitleMatchScore, SpacialCharRatioInURL, HasSubmitButton
- Scaler: `scaler_phase2_v2.pkl` (loaded and transformed only; never refit).

## Class Mapping

- 0 = Phishing
- 1 = Legitimate
- Sigmoid output = P(Legitimate)
- P(Phishing) = 1 - P(Legitimate)

## Confusion Matrix

Binary decision rule: `raw P(Legitimate) < 0.5` = Phishing; otherwise Legitimate. Positive class is **Phishing**.

| Actual \ Predicted | Phishing | Legitimate |
|---|---:|---:|
| Phishing | 14,957 | 0 |
| Legitimate | 1 | 20,227 |

TP = 14,957  
TN = 20,227  
FP = 1  
FN = 0

## Metrics

| Metric | Value |
|---|---:|
| Accuracy | 0.999972 |
| Precision | 0.999933 |
| Recall / Sensitivity / TPR | 1.000000 |
| Specificity / TNR | 0.999951 |
| F1 Score | 0.999967 |
| FPR | 0.000049 |
| FNR | 0.000000 |
| ROC-AUC | 1.000000 |
| PR-AUC / Average Precision | 1.000000 |
| Balanced Accuracy | 0.999975 |
| MCC | 0.999942 |
| Cohen's Kappa | 0.999942 |

## Three-Way Operational Results

Existing operational thresholds: `raw <= 0.30` = Phishing, `raw >= 0.75` = Legitimate, otherwise Suspicious.
- Phishing: 14,957
- Suspicious: 4
- Legitimate: 20,224
- Suspicious samples are **not** silently counted as binary TP/TN/FP/FN; the binary view above uses the documented 0.5 sigmoid decision boundary.

## Validation

- Model retrained: No.
- Scaler refit: No.
- Feature count/order matches model input and persisted feature list: Yes.
- Scaled test input shape: (35185, 20).
- Exact duplicate rows across train/test: 0; validation/test: 0.
- Selected features with absolute training-label correlation above 0.99: None.
- Selected features exactly equal to the label or its complement: None.
- The saved split and training code support a held-out evaluation. These checks do not establish independence beyond the recorded split construction or detect non-exact near-duplicates/leakage mechanisms outside the selected features.

## Interpretation

Accuracy describes all binary decisions, while phishing precision measures how often a phishing alert is correct and phishing recall measures how many phishing examples are detected. Specificity measures legitimate-site acceptance. ROC-AUC and PR-AUC evaluate probability ranking independently of a single decision threshold. The three-way operational view preserves the project’s abstention band instead of misreporting Suspicious samples as binary decisions.
