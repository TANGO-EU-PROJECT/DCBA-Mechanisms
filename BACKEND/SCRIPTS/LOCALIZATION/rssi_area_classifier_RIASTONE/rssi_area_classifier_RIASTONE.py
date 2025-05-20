import os
import sys
import re
import json
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
import joblib

def parse_rssi_line(line, df):
    """
    Parse raw WiFi scan line, extract RSSI values ordered by BSSID columns in df.
    Missing BSSID RSSIs are filled with -100.
    """
    pattern = r'BSSID:\s*([0-9a-f:]{17}),\s*Level:\s*(-?\d+|None)'
    matches = re.findall(pattern, line)
    
    # Map BSSID -> RSSI integer
    bssid_rssi_map = {}
    for bssid, rssi_str in matches:
        rssi = int(rssi_str) if rssi_str != 'None' else -100
        bssid_rssi_map[bssid.lower()] = rssi

    # Get BSSIDs from df columns, excluding AREA, in exact order
    ordered_bssids = [col.lower() for col in df.columns if col != 'AREA']

    # Build RSSI list in correct order for classifier
    rssi_values = [bssid_rssi_map.get(bssid, -100) for bssid in ordered_bssids]

    return rssi_values


def classifying_the_area(real_rssi_values, device_id, did):
    csv_path = "../WiFi_Heatmap_RIASTONE.csv"  # The heatmap dataset
    model_path = "rssi_RIASTONE_classifier.pkl"
    label_encoder_path = "label_encoder.pkl"

    # Load dataset
    if not os.path.exists(csv_path):
        print(f"Error: Dataset CSV file not found at {csv_path}")
        sys.exit(1)

    df = pd.read_csv(csv_path)

    X = df.drop(columns=['AREA'])
    y = df['AREA']

    # Check length of input values matches expected BSSID count
    if len(real_rssi_values) != X.shape[1]:
        print(f"Error: Expected {X.shape[1]} RSSI values, but got {len(real_rssi_values)}")
        sys.exit(1)

    # Encode labels
    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)

    # Load or train model
    if os.path.exists(model_path) and os.path.exists(label_encoder_path):
        clf = joblib.load(model_path)
        label_encoder = joblib.load(label_encoder_path)
        print("Loaded existing model and label encoder.")
    else:
        # Train-test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )
        # Train model
        clf = RandomForestClassifier(n_estimators=100, random_state=42)
        clf.fit(X_train, y_train)

        # Save model and label encoder
        joblib.dump(clf, model_path)
        joblib.dump(label_encoder, label_encoder_path)
        print("Model and label encoder trained and saved.")

    # Prepare input for prediction
    example_df = pd.DataFrame([real_rssi_values], columns=X.columns)

    # Predict probabilities and label
    probs = clf.predict_proba(example_df)[0]
    max_prob = np.max(probs)
    predicted_label = clf.predict(example_df)[0]

    threshold = 0.6

    if max_prob < threshold:
        outputResult = {
            "Localization Algorithm": "Random Forest Classifier (RF)",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": "Unknown",
            "Access Status": "Outside Restricted Area",
            "Confidence": round(float(max_prob), 3),
            "Threshold": threshold
        }
    else:
        predicted_area = label_encoder.inverse_transform([predicted_label])[0]
        outputResult = {
            "Localization Algorithm": "Random Forest Classifier (RF)",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": predicted_area,
            "Access Status": "Inside Restricted Area",
            "Confidence": round(float(max_prob), 3),
            "Threshold": threshold
        }

    # Output JSON to stdout
    sys.stdout.write(json.dumps(outputResult))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python script.py <device_id> <did> <raw_wifi_scan_line>")
        print("Example of raw_wifi_scan_line: \"BSSID: e8:6d:e9:0f:d5:f2, Level: -59 ...\"")
        sys.exit(1)

    device_id = sys.argv[1]
    did = sys.argv[2]
    raw_wifi_scan_line = sys.argv[3]

    # Load dataset once here to get BSSID columns order
    csv_path = "../WiFi_Heatmap_RIASTONE.csv"
    if not os.path.exists(csv_path):
        print(f"Error: Dataset CSV file not found at {csv_path}")
        sys.exit(1)

    df = pd.read_csv(csv_path)

    # Parse the raw line into ordered RSSI list
    real_time_rssi_values = parse_rssi_line(raw_wifi_scan_line, df)

    # Call classification
    classifying_the_area(real_time_rssi_values, device_id, did)
