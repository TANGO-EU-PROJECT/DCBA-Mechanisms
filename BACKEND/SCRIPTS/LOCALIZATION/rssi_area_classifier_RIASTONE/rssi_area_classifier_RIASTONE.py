import os
import sys
import json
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from xgboost import XGBClassifier
import joblib

def classifying_the_area(csv_path, real_rssi_values, device_id, did):
    model_path = "rssi_RIASTONE_classifier_xgb.pkl"
    label_encoder_path = "label_encoder.pkl"
    scaler_path = "scaler.pkl"

    if not os.path.exists(csv_path):
        error_result = {
            "Localization Algorithm": "XGBoost Classifier",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": None,
            "Access Status": "Error",
            "Error": f"Dataset CSV file not found at {csv_path}"
        }
        sys.stdout.write(json.dumps(error_result))
        sys.stdout.flush()
        return

    df = pd.read_csv(csv_path)

    # Separate RSSI features and labels
    X = df.drop(columns=['AREA', 'ACCESS_STATUS'])
    y = df['AREA']

    if len(real_rssi_values) != X.shape[1]:
        error_result = {
            "Localization Algorithm": "XGBoost Classifier",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": None,
            "Access Status": "Error",
            "Error": f"Expected {X.shape[1]} RSSI values, but got {len(real_rssi_values)}"
        }
        sys.stdout.write(json.dumps(error_result))
        sys.stdout.flush()
        return

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Encode labels
    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)

    # Load or train model
    if os.path.exists(model_path) and os.path.exists(label_encoder_path) and os.path.exists(scaler_path):
        clf = joblib.load(model_path)
        label_encoder = joblib.load(label_encoder_path)
        scaler = joblib.load(scaler_path)
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )
        clf = XGBClassifier(n_estimators=150, max_depth=10, use_label_encoder=False, eval_metric='mlogloss')
        clf.fit(X_train, y_train)
        joblib.dump(clf, model_path)
        joblib.dump(label_encoder, label_encoder_path)
        joblib.dump(scaler, scaler_path)

    # Prepare live input
    real_rssi_scaled = scaler.transform([real_rssi_values])
    predicted_label = clf.predict(real_rssi_scaled)[0]
    predicted_area = label_encoder.inverse_transform([predicted_label])[0]

    # Retrieve ACCESS_STATUS for predicted AREA
    access_status_row = df[df['AREA'] == predicted_area].iloc[0]
    access_status = access_status_row['ACCESS_STATUS']

    outputResult = {
        "Localization Algorithm": "XGBoost Classifier",
        "Device ID": device_id,
        "Employee DID": did,
        "Estimated Location": predicted_area,
        "Access Status": access_status
    }

    sys.stdout.write(json.dumps(outputResult))


if __name__ == "__main__":
    device_id = sys.argv[1]
    did = sys.argv[2]
    rssi_values_str = sys.argv[3]

    real_time_rssi_values = [int(v.strip()) for v in rssi_values_str.split(',')]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.abspath(os.path.join(script_dir, "..", "WiFi_Heatmap_RIASTONE.csv"))

    classifying_the_area(csv_path, real_time_rssi_values, device_id, did)
