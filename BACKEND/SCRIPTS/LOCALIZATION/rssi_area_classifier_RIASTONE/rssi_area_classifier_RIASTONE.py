# import os
# import sys
# import json
# import pandas as pd
# import numpy as np
# from sklearn.model_selection import train_test_split
# from sklearn.preprocessing import LabelEncoder
# from sklearn.ensemble import RandomForestClassifier
# import joblib

# def classifying_the_area(csv_path, real_rssi_values, device_id, did):
#     model_path = "rssi_RIASTONE_classifier.pkl"
#     label_encoder_path = "label_encoder.pkl"

#     if not os.path.exists(csv_path):
#         error_result = {
#             "Localization Algorithm": "Random Forest Classifier (RF)",
#             "Device ID": device_id,
#             "Employee DID": did,
#             "Estimated Location": None,
#             "Access Status": "Error",
#             "Error": f"Dataset CSV file not found at {csv_path}"
#         }
#         sys.stdout.write(json.dumps(error_result))
#         sys.stdout.flush()
#         return

#     df = pd.read_csv(csv_path)

#     # Separate RSSI features and labels
#     X = df.drop(columns=['AREA', 'ACCESS_STATUS'])
#     y = df['AREA']

#     if len(real_rssi_values) != X.shape[1]:
#         error_result = {
#             "Localization Algorithm": "Random Forest Classifier (RF)",
#             "Device ID": device_id,
#             "Employee DID": did,
#             "Estimated Location": None,
#             "Access Status": "Error",
#             "Error": f"Expected {X.shape[1]} RSSI values, but got {len(real_rssi_values)}"
#         }
#         sys.stdout.write(json.dumps(error_result))
#         sys.stdout.flush()
#         return

#     # Encode AREA labels
#     label_encoder = LabelEncoder()
#     y_encoded = label_encoder.fit_transform(y)

#     # Load or train model
#     if os.path.exists(model_path) and os.path.exists(label_encoder_path):
#         clf = joblib.load(model_path)
#         label_encoder = joblib.load(label_encoder_path)
#     else:
#         X_train, X_test, y_train, y_test = train_test_split(
#             X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
#         )
#         clf = RandomForestClassifier(n_estimators=100, random_state=42)
#         clf.fit(X_train, y_train)
#         joblib.dump(clf, model_path)
#         joblib.dump(label_encoder, label_encoder_path)

#     # Predict
#     example_df = pd.DataFrame([real_rssi_values], columns=X.columns)
#     predicted_label = clf.predict(example_df)[0]
#     predicted_area = label_encoder.inverse_transform([predicted_label])[0]

#     # Retrieve ACCESS_STATUS for predicted AREA
#     access_status_row = df[df['AREA'] == predicted_area].iloc[0]
#     access_status = access_status_row['ACCESS_STATUS']

#     outputResult = {
#         "Localization Algorithm": "Random Forest Classifier (RF)",
#         "Device ID": device_id,
#         "Employee DID": did,
#         "Estimated Location": predicted_area,
#         "Access Status": access_status
#     }

#     sys.stdout.write(json.dumps(outputResult))


# if __name__ == "__main__":
#     device_id = sys.argv[1]
#     did = sys.argv[2]
#     rssi_values_str = sys.argv[3]

#     real_time_rssi_values = [int(v.strip()) for v in rssi_values_str.split(',')]

#     script_dir = os.path.dirname(os.path.abspath(__file__))
#     csv_path = os.path.abspath(os.path.join(script_dir, "..", "WiFi_Heatmap_RIASTONE.csv"))

#     classifying_the_area(csv_path, real_time_rssi_values, device_id, did)


#############
#####################################

import os
import sys
import json
import pandas as pd
import numpy as np

def classifying_the_area_euclidean(csv_path, real_rssi_values, device_id, did):
    if not os.path.exists(csv_path):
        error_result = {
            "Localization Algorithm": "Euclidean Distance",
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

    # Separate metadata and RSSI values
    rssi_columns = df.columns[2:]  # Skip AREA and ACCESS_STATUS
    X = df[rssi_columns].astype(float).values
    y = df['AREA'].values
    access_statuses = df['ACCESS_STATUS'].values

    if len(real_rssi_values) != X.shape[1]:
        error_result = {
            "Localization Algorithm": "Euclidean Distance",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": None,
            "Access Status": "Error",
            "Error": f"Expected {X.shape[1]} RSSI values, but got {len(real_rssi_values)}"
        }
        sys.stdout.write(json.dumps(error_result))
        sys.stdout.flush()
        return

    # Convert live RSSI to numpy array
    real_rssi_array = np.array(real_rssi_values).astype(float)

    # Compute Euclidean distances
    distances = np.linalg.norm(X - real_rssi_array, axis=1)

    # Get index of closest match
    best_index = np.argmin(distances)
    predicted_area = y[best_index]
    access_status = access_statuses[best_index]

    outputResult = {
        "Localization Algorithm": "Euclidean Distance",
        "Device ID": device_id,
        "Employee DID": did,
        "Estimated Location": predicted_area,
        "Access Status": access_status
    }

    sys.stdout.write(json.dumps(outputResult))
    sys.stdout.flush()

if __name__ == "__main__":
    device_id = sys.argv[1]
    did = sys.argv[2]
    rssi_values_str = sys.argv[3]
    
    # Parse comma-separated RSSI values
    real_time_rssi_values = [int(v.strip()) for v in rssi_values_str.split(',')]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.abspath(os.path.join(script_dir, "..", "WiFi_Heatmap_RIASTONE_ED.csv"))

    classifying_the_area_euclidean(csv_path, real_time_rssi_values, device_id, did)