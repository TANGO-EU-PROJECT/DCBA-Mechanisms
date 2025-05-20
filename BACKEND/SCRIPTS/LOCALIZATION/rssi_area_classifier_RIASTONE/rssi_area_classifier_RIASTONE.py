import os
import sys
import json
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
import joblib

def classifying_the_area(csv_path, real_rssi_values, device_id, did):
    model_path = "rssi_RIASTONE_classifier.pkl"
    label_encoder_path = "label_encoder.pkl"

    if not os.path.exists(csv_path):
        error_result = {
            "Localization Algorithm": "Random Forest Classifier (RF)",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": None,
            "Access Status": "Error",
            "Confidence": 0,
            "Threshold": 0.6,
            "Error": f"Dataset CSV file not found at {csv_path}"
        }
        sys.stdout.write(json.dumps(error_result))
        sys.stdout.flush()
        return


    df = pd.read_csv(csv_path)

    X = df.drop(columns=['AREA'])
    y = df['AREA']

    if len(real_rssi_values) != X.shape[1]:
        error_result = {
            "Localization Algorithm": "Random Forest Classifier (RF)",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": None,
            "Access Status": "Error",
            "Confidence": 0,
            "Threshold": 0.6,
            "Error": f"Expected {X.shape[1]} RSSI values, but got {len(real_rssi_values)}"
        }
        sys.stdout.write(json.dumps(error_result))
        sys.stdout.flush()
        return


    # Encode labels
    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)

    # Load or train model
    if os.path.exists(model_path) and os.path.exists(label_encoder_path):
        clf = joblib.load(model_path)
        label_encoder = joblib.load(label_encoder_path)
        #print("Loaded existing model and label encoder.")
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )
        clf = RandomForestClassifier(n_estimators=100, random_state=42)
        clf.fit(X_train, y_train)

        joblib.dump(clf, model_path)
        joblib.dump(label_encoder, label_encoder_path)
        #print("Model and label encoder trained and saved.")

    # Predict
    example_df = pd.DataFrame([real_rssi_values], columns=X.columns)
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

    sys.stdout.write(json.dumps(outputResult))


if __name__ == "__main__":

    device_id = sys.argv[1]
    did = sys.argv[2]
    rssi_values_str = sys.argv[3]

    real_time_rssi_values = [int(v.strip()) for v in rssi_values_str.split(',')]

    csv_path = "../../SCRIPTS/LOCALIZATION/WiFi_Heatmap_RIASTONE.csv"
    classifying_the_area(csv_path, real_time_rssi_values, device_id, did)
