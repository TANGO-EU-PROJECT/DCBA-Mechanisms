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



# import os
# import sys
# import json
# import pandas as pd
# import numpy as np

# def classifying_the_area_euclidean(csv_path, real_rssi_values, device_id, did):
#     if not os.path.exists(csv_path):
#         error_result = {
#             "Localization Algorithm": "Euclidean Distance",
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

#     # Separate metadata and RSSI values
#     rssi_columns = df.columns[2:]  # Skip AREA and ACCESS_STATUS
#     X = df[rssi_columns].astype(float).values
#     y = df['AREA'].values
#     access_statuses = df['ACCESS_STATUS'].values

#     if len(real_rssi_values) != X.shape[1]:
#         error_result = {
#             "Localization Algorithm": "Euclidean Distance",
#             "Device ID": device_id,
#             "Employee DID": did,
#             "Estimated Location": None,
#             "Access Status": "Error",
#             "Error": f"Expected {X.shape[1]} RSSI values, but got {len(real_rssi_values)}"
#         }
#         sys.stdout.write(json.dumps(error_result))
#         sys.stdout.flush()
#         return

#     # Convert live RSSI to numpy array
#     real_rssi_array = np.array(real_rssi_values).astype(float)

#     # Compute Euclidean distances
#     distances = np.linalg.norm(X - real_rssi_array, axis=1)

#     # Get index of closest match
#     best_index = np.argmin(distances)
#     predicted_area = y[best_index]
#     access_status = access_statuses[best_index]

#     outputResult = {
#         "Localization Algorithm": "Euclidean Distance",
#         "Device ID": device_id,
#         "Employee DID": did,
#         "Estimated Location": predicted_area,
#         "Access Status": access_status
#     }

#     sys.stdout.write(json.dumps(outputResult))
#     sys.stdout.flush()

# if __name__ == "__main__":
#     device_id = sys.argv[1]
#     did = sys.argv[2]
#     rssi_values_str = sys.argv[3]
    
#     # Parse comma-separated RSSI values
#     real_time_rssi_values = [int(v.strip()) for v in rssi_values_str.split(',')]

#     script_dir = os.path.dirname(os.path.abspath(__file__))
#     csv_path = os.path.abspath(os.path.join(script_dir, "..", "WiFi_Heatmap_RIASTONE_ED.csv"))

#     classifying_the_area_euclidean(csv_path, real_time_rssi_values, device_id, did)


#############################################################################################
import sys
import re
import os
import pandas as pd
import numpy as np
from glob import glob
import json

# Signal strength to assign when an Access Point (BSSID) is unobserved in the current scan
UNOBSERVED_AP_SIGNAL = -120


# Get the absolute path of the directory where the script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# List of reference CSV files with full paths
CSV_FILES = [
    os.path.join(SCRIPT_DIR, "PACKAGING_LINES.csv"),
    os.path.join(SCRIPT_DIR, "PERMITTED_AREA.csv"),
    os.path.join(SCRIPT_DIR, "SORTING_LINES_1_TO_3.csv"),
    os.path.join(SCRIPT_DIR, "SORTING_LINES_4_AND_5.csv"),
    os.path.join(SCRIPT_DIR, "SORTING_LINES_6_TO_8.csv"),
    os.path.join(SCRIPT_DIR, "WAREHOUSE.csv"),

    os.path.join(SCRIPT_DIR, "EKETA_204.csv"),
    os.path.join(SCRIPT_DIR, "EKETA_201.csv"),
    os.path.join(SCRIPT_DIR, "SERVER_ROOM.csv"),
]

def parse_log(log_str):
    """
    Parses a log message containing BSSID and RSSI signal levels.

    Args:
        log_str (str): Log string in the format 'BSSID: xx:xx:xx, Level: -yy, ...'

    Returns:
        dict: Mapping from lowercase BSSID strings to integer signal levels
    """
    matches = re.findall(r'BSSID:\s*([0-9a-f:]+),\s*Level:\s*(-?\d+)', log_str, re.IGNORECASE)
    return {bssid.lower(): int(level) for bssid, level in matches}

def load_reference_data(filename):
    """
    Loads reference RSSI data from a CSV file.

    Args:
        filename (str): Path to the reference CSV file

    Returns:
        tuple: DataFrame and list of BSSID column names
    """
    df = pd.read_csv(filename)
    bssid_columns = df.columns[1:]  # Skip only 'AREA' column
    return df, list(bssid_columns)

def compute_euclidean_distance(vec1, vec2):
    """
    Computes the Euclidean distance between two vectors.

    Args:
        vec1 (list): First numeric vector
        vec2 (list): Second numeric vector

    Returns:
        float: Euclidean distance between vec1 and vec2
    """
    return np.linalg.norm(np.array(vec1) - np.array(vec2))

def find_best_area(log_rssi_dict):
    """
    Determines the best-matching area based on RSSI similarity using Euclidean distance.

    Args:
        log_rssi_dict (dict): Dictionary mapping BSSID to observed RSSI values

    Returns:
        tuple: (predicted_area(s), access_status, min_distance, error_messages)
    """
    min_distance = float('inf')     # Initialize the minimum distance to infinity
    best_areas = []                 # List to store areas with the minimum distance
    error_messages = []            # List of error messages encountered during processing
    any_distance_computed = False  # Flag to check if any distance was calculated

    for file in CSV_FILES:
        if not os.path.exists(file):
            error_messages.append(f"File not found: {file}")
            continue

        try:
            df, bssid_columns = load_reference_data(file)
        except Exception as e:
            error_messages.append(f"Error reading {file}: {str(e)}")
            continue

        # Create vector for current observation (fill missing BSSIDs with default signal)
        real_time_vector = [
            log_rssi_dict.get(bssid.lower(), UNOBSERVED_AP_SIGNAL) for bssid in bssid_columns
        ]

        # If all values in the vector are UNOBSERVED_AP_SIGNAL, skip this file
        if all(val == UNOBSERVED_AP_SIGNAL for val in real_time_vector):
            continue

        for index, row in df.iterrows():
            try:
                ref_vector = row[bssid_columns].astype(int).tolist()
                distance = compute_euclidean_distance(real_time_vector, ref_vector)
                any_distance_computed = True

                area = row['AREA']

                if distance < min_distance:
                    min_distance = distance
                    best_areas = [area]
                elif distance == min_distance:
                    best_areas.append(area)
            except Exception as e:
                error_messages.append(f"Error processing row {index} in {file}: {str(e)}")

    # If no distance could be computed, return UNKNOWN
    if not any_distance_computed:
        return "UNKNOWN", None, error_messages


    # Final decision logic
    if "PERMITTED_AREA" in best_areas:
        return "PERMITTED_AREA", min_distance, error_messages
    else:
        # Final decision logic: always return the first best area
        return best_areas[0], min_distance, error_messages


def main():
    """
    Main entry point of the script. Parses command-line arguments, processes input,
    and prints the predicted location result as a dictionary.
    """
    output = {
        "Localization Algorithm": "Euclidean Distance",
        "Device ID": None,
        "Employee DID": None,
        "Estimated Location": None,
        "Error": None
    }


    try:
        # Ensure the correct number of arguments are provided
        if len(sys.argv) < 4:
            raise ValueError("Usage: python3 Euclidean_Distance.py <device_id> <did> <log_message>")

        device_id = sys.argv[1]
        did = sys.argv[2]
        log_message = sys.argv[3]

        output["Device ID"] = device_id
        output["Employee DID"] = did

        # Parse observed RSSI values from the log string
        log_rssi_dict = parse_log(log_message)

        # Check that all required reference files exist before proceeding
        missing_files = [file for file in CSV_FILES if not os.path.exists(file)]
        if missing_files:
            raise FileNotFoundError(f"Missing reference files: {', '.join(missing_files)}")

        # Predict the best area based on the observed signal levels
        predicted_area, distance, errors = find_best_area(log_rssi_dict)

        # If multiple best areas are found, label as ambiguous
        output["Estimated Location"] = predicted_area


        # Add any error messages to the output
        if errors:
            output["Error"] = "; ".join(errors)

    except Exception as e:
        output["Error"] = str(e)

    # Print result
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Force JSON error output even for uncaught exceptions
        error_output = {
            "Localization Algorithm": "Euclidean Distance",
            "Device ID": None,
            "Employee DID": None,
            "Estimated Location": None,
            "Error": f"Unhandled Exception: {str(e)}"
        }
        print(json.dumps(error_output))


# import sys
# import os
# import re
# import json
# import pandas as pd
# import numpy as np
# from glob import glob
# from sklearn.ensemble import RandomForestClassifier

# # Constants
# UNOBSERVED_AP_SIGNAL = -120
# SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# CSV_FILES = [
#     os.path.join(SCRIPT_DIR, "PACKAGING_LINES.csv"),
#     os.path.join(SCRIPT_DIR, "PERMITTED_AREA.csv"),
#     os.path.join(SCRIPT_DIR, "SORTING_LINES_1_TO_3.csv"),
#     os.path.join(SCRIPT_DIR, "SORTING_LINES_4_AND_5.csv"),
#     os.path.join(SCRIPT_DIR, "SORTING_LINES_6_TO_8.csv"),
#     os.path.join(SCRIPT_DIR, "WAREHOUSE.csv")
# ]

# def parse_log(log_str):
#     matches = re.findall(r'BSSID:\s*([0-9a-f:]+),\s*Level:\s*(-?\d+)', log_str, re.IGNORECASE)
#     return {bssid.lower(): int(level) for bssid, level in matches}

# def load_and_prepare_training_data(csv_files):
#     data = []
#     labels = []
#     all_bssids = set()

#     # First pass: collect all unique BSSIDs
#     for file in csv_files:
#         if not os.path.exists(file):
#             continue
#         df = pd.read_csv(file)
#         all_bssids.update(df.columns[2:].str.lower())

#     all_bssids = sorted(all_bssids)

#     # Second pass: build feature matrix
#     for file in csv_files:
#         if not os.path.exists(file):
#             continue
#         df = pd.read_csv(file)
#         bssid_columns = df.columns[2:].str.lower()
#         for _, row in df.iterrows():
#             feature_vector = []
#             for bssid in all_bssids:
#                 if bssid in bssid_columns:
#                     value = row[bssid]
#                     try:
#                         feature_vector.append(int(value))
#                     except:
#                         feature_vector.append(UNOBSERVED_AP_SIGNAL)
#                 else:
#                     feature_vector.append(UNOBSERVED_AP_SIGNAL)
#             data.append(feature_vector)
#             labels.append(row['AREA'])
    
#     return np.array(data), np.array(labels), all_bssids

# def vectorize_log(log_rssi_dict, all_bssids):
#     return np.array([log_rssi_dict.get(bssid, UNOBSERVED_AP_SIGNAL) for bssid in all_bssids]).reshape(1, -1)

# def main():
#     output = {
#         "Localization Algorithm": "Random Forest Classifier",
#         "Device ID": None,
#         "Employee DID": None,
#         "Estimated Location": None,
#         "Access Status": None,
#         "Error": None
#     }

#     try:
#         if len(sys.argv) < 4:
#             raise ValueError("Usage: python3 RandomForest_Localization.py <device_id> <did> <log_message>")

#         device_id = sys.argv[1]
#         did = sys.argv[2]
#         log_message = sys.argv[3]

#         output["Device ID"] = device_id
#         output["Employee DID"] = did

#         log_rssi_dict = parse_log(log_message)

#         # Prepare training data
#         X_train, y_train, all_bssids = load_and_prepare_training_data(CSV_FILES)

#         if len(X_train) == 0:
#             raise RuntimeError("No training data loaded.")

#         clf = RandomForestClassifier(n_estimators=100, random_state=42)
#         clf.fit(X_train, y_train)

#         X_log = vectorize_log(log_rssi_dict, all_bssids)
#         predicted_area = clf.predict(X_log)[0]

#         output["Estimated Location"] = predicted_area
#         output["Access Status"] = "Access_Pending" if "PERMITTED" in predicted_area else "Restricted"

#     except Exception as e:
#         output["Error"] = str(e)

#     print(json.dumps(output))


# if __name__ == "__main__":
#     try:
#         main()
#     except Exception as e:
#         print(json.dumps({
#             "Localization Algorithm": "Random Forest Classifier",
#             "Device ID": None,
#             "Employee DID": None,
#             "Estimated Location": None,
#             "Access Status": None,
#             "Error": f"Unhandled Exception: {str(e)}"
#         }))

