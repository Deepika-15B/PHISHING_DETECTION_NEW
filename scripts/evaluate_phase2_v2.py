"""Evaluate the existing Phase 2 v2 FNN on its persisted held-out test split.

This is evaluation-only: it loads the saved model, scaler, feature list, and
``data/processed_v2/test.csv`` without fitting or modifying any model artifact.
"""
from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    matthews_corrcoef,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "processed_v2"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
TRAIN_PATH = DATA_DIR / "train.csv"
VALIDATION_PATH = DATA_DIR / "validation.csv"
TEST_PATH = DATA_DIR / "test.csv"
MODEL_PATH = MODELS_DIR / "fnn_phase2_v2.keras"
SCALER_PATH = MODELS_DIR / "scaler_phase2_v2.pkl"
FEATURES_PATH = MODELS_DIR / "top20_features.pkl"


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1_048_576), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def operating_prediction(raw_probability: float) -> tuple[str, float, str]:
    """Apply the existing Phase 2 operational thresholds without altering them."""
    legitimate_probability = float(raw_probability)
    phishing_probability = 1.0 - legitimate_probability
    if legitimate_probability >= 0.75:
        predicted_class = "Legitimate"
        confidence = legitimate_probability * 100
    elif legitimate_probability <= 0.30:
        predicted_class = "Phishing"
        confidence = phishing_probability * 100
    else:
        predicted_class = "Suspicious"
        confidence = max(legitimate_probability, phishing_probability) * 100
    risk_level = "High" if phishing_probability >= 0.8 else "Medium" if phishing_probability >= 0.4 else "Low"
    return predicted_class, round(confidence, 2), risk_level


def create_confusion_matrix_figure(matrix: np.ndarray, output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 5))
    image = ax.imshow(matrix, cmap="Blues")
    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    ax.set(
        xticks=[0, 1], yticks=[0, 1],
        xticklabels=["Phishing", "Legitimate"],
        yticklabels=["Phishing", "Legitimate"],
        xlabel="Predicted class", ylabel="Actual class",
        title="Phase 2 v2 Binary Confusion Matrix",
    )
    for row in range(2):
        for column in range(2):
            ax.text(column, row, f"{matrix[row, column]:,}", ha="center", va="center")
    fig.tight_layout()
    fig.savefig(output_path, dpi=220)
    plt.close(fig)


def create_curve_figures(y_phishing: np.ndarray, phishing_probability: np.ndarray) -> tuple[float, float]:
    fpr, tpr, _ = roc_curve(y_phishing, phishing_probability)
    roc_auc = roc_auc_score(y_phishing, phishing_probability)
    precision, recall, _ = precision_recall_curve(y_phishing, phishing_probability)
    pr_auc = average_precision_score(y_phishing, phishing_probability)

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(fpr, tpr, label=f"ROC-AUC = {roc_auc:.6f}")
    ax.plot([0, 1], [0, 1], linestyle="--", color="gray", label="Chance")
    ax.set(xlabel="False Positive Rate", ylabel="True Positive Rate", title="Phase 2 v2 ROC Curve")
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "phase2_roc_curve.png", dpi=220)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(recall, precision, label=f"Average Precision = {pr_auc:.6f}")
    ax.set(xlabel="Recall (Phishing)", ylabel="Precision (Phishing)", title="Phase 2 v2 Precision-Recall Curve")
    ax.legend(loc="lower left")
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "phase2_precision_recall_curve.png", dpi=220)
    plt.close(fig)
    return float(roc_auc), float(pr_auc)


def main() -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    for required_path in (TRAIN_PATH, VALIDATION_PATH, TEST_PATH, MODEL_PATH, SCALER_PATH, FEATURES_PATH):
        if not required_path.exists():
            raise FileNotFoundError(f"Required Phase 2 v2 artifact is missing: {required_path}")

    with FEATURES_PATH.open("rb") as handle:
        top20_features = pickle.load(handle)
    with SCALER_PATH.open("rb") as handle:
        scaler = pickle.load(handle)
    model = tf.keras.models.load_model(MODEL_PATH)

    train_df = pd.read_csv(TRAIN_PATH)
    validation_df = pd.read_csv(VALIDATION_PATH)
    test_df = pd.read_csv(TEST_PATH)
    if list(top20_features) != list(test_df[top20_features].columns):
        raise ValueError("Test-set feature order does not match top20_features.pkl")
    if len(top20_features) != 20 or getattr(scaler, "n_features_in_", None) != 20 or model.input_shape[-1] != 20:
        raise ValueError("Phase 2 v2 model/scaler/feature-list dimensions are inconsistent")

    # The V2 training script fits the scaler only on train.csv; this evaluation
    # intentionally calls transform only and never refits it.
    x_test = test_df[top20_features]
    y_label = test_df["label"].astype(int).to_numpy()
    x_scaled = scaler.transform(x_test)
    raw_probability = model.predict(x_scaled, verbose=0).reshape(-1)
    legitimate_probability = raw_probability
    phishing_probability = 1.0 - raw_probability

    # Standard binary view: class 0 is phishing, class 1 is legitimate. For
    # positive-class metrics, encode phishing as one explicitly.
    y_phishing = (y_label == 0).astype(int)
    predicted_phishing_binary = (raw_probability < 0.5).astype(int)
    binary_prediction_label = np.where(predicted_phishing_binary == 1, 0, 1)
    matrix = confusion_matrix(y_phishing, predicted_phishing_binary, labels=[1, 0])
    true_positive, false_negative = (int(value) for value in matrix[0])
    false_positive, true_negative = (int(value) for value in matrix[1])

    accuracy = accuracy_score(y_phishing, predicted_phishing_binary)
    precision = precision_score(y_phishing, predicted_phishing_binary, zero_division=0)
    recall = recall_score(y_phishing, predicted_phishing_binary, zero_division=0)
    specificity = true_negative / (true_negative + false_positive) if (true_negative + false_positive) else 0.0
    f1_score_value = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    false_positive_rate = false_positive / (false_positive + true_negative) if (false_positive + true_negative) else 0.0
    false_negative_rate = false_negative / (false_negative + true_positive) if (false_negative + true_positive) else 0.0
    roc_auc, pr_auc = create_curve_figures(y_phishing, phishing_probability)
    balanced_accuracy = balanced_accuracy_score(y_phishing, predicted_phishing_binary)
    mcc = matthews_corrcoef(y_phishing, predicted_phishing_binary)
    kappa = cohen_kappa_score(y_phishing, predicted_phishing_binary)

    operating_results = [operating_prediction(value) for value in raw_probability]
    operating_class = [result[0] for result in operating_results]
    confidence = [result[1] for result in operating_results]
    risk_level = [result[2] for result in operating_results]
    true_class = np.where(y_label == 0, "Phishing", "Legitimate")
    output_frame = pd.DataFrame({
        "test_row": test_df.index,
        "true_label": y_label,
        "true_class": true_class,
        "raw_model_probability": raw_probability,
        "legitimate_probability": legitimate_probability,
        "phishing_probability": phishing_probability,
        "binary_predicted_label": binary_prediction_label,
        "binary_predicted_class": np.where(binary_prediction_label == 0, "Phishing", "Legitimate"),
        "predicted_class": operating_class,
        "confidence": confidence,
        "risk_level": risk_level,
    })
    output_frame.to_csv(REPORTS_DIR / "phase2_test_predictions.csv", index=False)
    create_confusion_matrix_figure(matrix, REPORTS_DIR / "phase2_confusion_matrix.png")

    duplicate_train_test = int(len(train_df.merge(test_df, how="inner")))
    duplicate_validation_test = int(len(validation_df.merge(test_df, how="inner")))
    train_labels = train_df["label"].astype(int).to_numpy()
    feature_correlations = train_df[top20_features].corrwith(train_df["label"].astype(float)).abs()
    high_correlation_features = {
        feature: float(value) for feature, value in feature_correlations.items() if value > 0.99
    }
    direct_label_features = [
        feature for feature in top20_features
        if np.array_equal(train_df[feature].to_numpy(), train_labels)
        or np.array_equal(train_df[feature].to_numpy(), 1 - train_labels)
    ]
    metrics = {
        "dataset": {
            "name": "PhiUSIIL Dataset_HTML processed_v2 held-out test split",
            "test_split_source": "data/processed_v2/test.csv; generated by phase2_preprocess_phiusiil.py with random_state=42 and consumed by phase2_train_fnn_v2.py",
            "total_test_samples": int(len(test_df)),
            "phishing_samples": int((y_label == 0).sum()),
            "legitimate_samples": int((y_label == 1).sum()),
        },
        "model": {
            "model": MODEL_PATH.name,
            "scaler": SCALER_PATH.name,
            "feature_file": FEATURES_PATH.name,
            "feature_count": len(top20_features),
            "feature_order": top20_features,
            "model_input_shape": list(model.input_shape),
            "model_output_shape": list(model.output_shape),
            "artifact_sha256": {path.name: sha256(path) for path in (MODEL_PATH, SCALER_PATH, FEATURES_PATH)},
        },
        "class_mapping": {
            "0": "Phishing", "1": "Legitimate",
            "raw_model_probability": "P(Legitimate)",
            "phishing_probability": "1 - raw_model_probability",
        },
        "binary_evaluation": {
            "decision_rule": "raw_model_probability < 0.5 => Phishing; otherwise Legitimate",
            "positive_class": "Phishing",
            "confusion_matrix_class_order": ["Phishing", "Legitimate"],
            "confusion_matrix": matrix.tolist(),
            "TP": true_positive, "TN": true_negative, "FP": false_positive, "FN": false_negative,
            "accuracy": float(accuracy), "precision": float(precision), "recall_sensitivity_tpr": float(recall),
            "specificity_tnr": float(specificity), "f1_score": float(f1_score_value),
            "false_positive_rate": float(false_positive_rate), "false_negative_rate": float(false_negative_rate),
            "roc_auc": roc_auc, "pr_auc_average_precision": pr_auc,
            "balanced_accuracy": float(balanced_accuracy), "mcc": float(mcc), "cohens_kappa": float(kappa),
        },
        "three_way_operational_evaluation": {
            "decision_rule": "raw <= 0.30 => Phishing; raw >= 0.75 => Legitimate; otherwise Suspicious",
            "phishing": int((output_frame["predicted_class"] == "Phishing").sum()),
            "suspicious": int((output_frame["predicted_class"] == "Suspicious").sum()),
            "legitimate": int((output_frame["predicted_class"] == "Legitimate").sum()),
            "note": "Suspicious samples are excluded from the binary TP/TN/FP/FN calculation; binary metrics use the explicit 0.5 sigmoid decision rule above.",
        },
        "validation": {
            "scaler_refit": False,
            "model_retrained": False,
            "feature_order_matches": True,
            "scaler_feature_count": int(getattr(scaler, "n_features_in_", 0)),
            "scaled_input_shape": list(x_scaled.shape),
            "duplicate_train_test_rows": duplicate_train_test,
            "duplicate_validation_test_rows": duplicate_validation_test,
            "selected_features_abs_correlation_gt_0_99": high_correlation_features,
            "selected_features_equal_label_or_complement": direct_label_features,
        },
    }
    (REPORTS_DIR / "phase2_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    report = classification_report(
        y_phishing, predicted_phishing_binary, labels=[1, 0],
        target_names=["Phishing", "Legitimate"], digits=6, zero_division=0,
    )
    (REPORTS_DIR / "phase2_classification_report.txt").write_text(
        "Phase 2 v2 binary classification report\n"
        "Positive class: Phishing. Binary rule: raw P(Legitimate) < 0.5 => Phishing.\n"
        "Operational Suspicious predictions are reported separately and are not silently included here.\n\n"
        + report,
        encoding="utf-8",
    )

    lines = [
        "# Phase 2 v2 Model Evaluation", "",
        "## Dataset", "",
        "- Dataset name: PhiUSIIL `Dataset_HTML.csv`, processed Phase 2 v2 split.",
        f"- Test sample count: {len(test_df):,}",
        f"- Phishing count (label 0): {(y_label == 0).sum():,}",
        f"- Legitimate count (label 1): {(y_label == 1).sum():,}",
        "- Test split source: `data/processed_v2/test.csv`; deterministic 70/15/15 stratified split with `random_state=42` from `phase2_preprocess_phiusiil.py`.",
        "- The v2 training script uses `train.csv` for fit, `validation.csv` only for validation monitoring, and this `test.csv` only for evaluation.", "",
        "## Model", "",
        f"- Model: `{MODEL_PATH.name}`", "- Architecture: Dense(64, ReLU) → Dropout(0.20) → Dense(32, ReLU) → Dropout(0.20) → Dense(1, Sigmoid).",
        f"- Feature count: {len(top20_features)}", f"- Selected features: {', '.join(top20_features)}", f"- Scaler: `{SCALER_PATH.name}` (loaded and transformed only; never refit).", "",
        "## Class Mapping", "", "- 0 = Phishing", "- 1 = Legitimate", "- Sigmoid output = P(Legitimate)", "- P(Phishing) = 1 - P(Legitimate)", "",
        "## Confusion Matrix", "",
        "Binary decision rule: `raw P(Legitimate) < 0.5` = Phishing; otherwise Legitimate. Positive class is **Phishing**.", "",
        "| Actual \\ Predicted | Phishing | Legitimate |", "|---|---:|---:|",
        f"| Phishing | {true_positive:,} | {false_negative:,} |", f"| Legitimate | {false_positive:,} | {true_negative:,} |", "",
        f"TP = {true_positive:,}  ", f"TN = {true_negative:,}  ", f"FP = {false_positive:,}  ", f"FN = {false_negative:,}", "",
        "## Metrics", "", "| Metric | Value |", "|---|---:|",
        *[f"| {name} | {value:.6f} |" for name, value in [
            ("Accuracy", accuracy), ("Precision", precision), ("Recall / Sensitivity / TPR", recall),
            ("Specificity / TNR", specificity), ("F1 Score", f1_score_value), ("FPR", false_positive_rate),
            ("FNR", false_negative_rate), ("ROC-AUC", roc_auc), ("PR-AUC / Average Precision", pr_auc),
            ("Balanced Accuracy", balanced_accuracy), ("MCC", mcc), ("Cohen's Kappa", kappa),
        ]], "",
        "## Three-Way Operational Results", "",
        "Existing operational thresholds: `raw <= 0.30` = Phishing, `raw >= 0.75` = Legitimate, otherwise Suspicious.",
        f"- Phishing: {(output_frame['predicted_class'] == 'Phishing').sum():,}",
        f"- Suspicious: {(output_frame['predicted_class'] == 'Suspicious').sum():,}",
        f"- Legitimate: {(output_frame['predicted_class'] == 'Legitimate').sum():,}",
        "- Suspicious samples are **not** silently counted as binary TP/TN/FP/FN; the binary view above uses the documented 0.5 sigmoid decision boundary.", "",
        "## Validation", "",
        "- Model retrained: No.", "- Scaler refit: No.", "- Feature count/order matches model input and persisted feature list: Yes.",
        f"- Scaled test input shape: {tuple(x_scaled.shape)}.",
        f"- Exact duplicate rows across train/test: {duplicate_train_test:,}; validation/test: {duplicate_validation_test:,}.",
        f"- Selected features with absolute training-label correlation above 0.99: {list(high_correlation_features) or 'None'}.",
        f"- Selected features exactly equal to the label or its complement: {direct_label_features or 'None'}.",
        "- The saved split and training code support a held-out evaluation. These checks do not establish independence beyond the recorded split construction or detect non-exact near-duplicates/leakage mechanisms outside the selected features.", "",
        "## Interpretation", "",
        "Accuracy describes all binary decisions, while phishing precision measures how often a phishing alert is correct and phishing recall measures how many phishing examples are detected. Specificity measures legitimate-site acceptance. ROC-AUC and PR-AUC evaluate probability ranking independently of a single decision threshold. The three-way operational view preserves the project’s abstention band instead of misreporting Suspicious samples as binary decisions.",
    ]
    (REPORTS_DIR / "PHASE2_ACCURACY_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("==========================================")
    print("PHASE 2 v2 MODEL EVALUATION")
    print("==========================================")
    print(f"Test samples: {len(test_df):,}")
    print(f"Phishing: {(y_label == 0).sum():,}")
    print(f"Legitimate: {(y_label == 1).sum():,}\n")
    print(f"TP: {true_positive:,}")
    print(f"TN: {true_negative:,}")
    print(f"FP: {false_positive:,}")
    print(f"FN: {false_negative:,}\n")
    print(f"Accuracy: {accuracy * 100:.4f}%")
    print(f"Precision: {precision * 100:.4f}%")
    print(f"Recall: {recall * 100:.4f}%")
    print(f"Specificity: {specificity * 100:.4f}%")
    print(f"F1 Score: {f1_score_value * 100:.4f}%")
    print(f"ROC-AUC: {roc_auc * 100:.4f}%")
    print(f"PR-AUC: {pr_auc * 100:.4f}%")
    print(f"Balanced Accuracy: {balanced_accuracy * 100:.4f}%")
    print(f"MCC: {mcc:.6f}")
    print("==========================================")


if __name__ == "__main__":
    main()
