import sys
import os
import re
import csv
import json
import numpy as np
from math import sqrt
import math

epsilon = 1e-10

############################## HELPER FUNCTIONS ##############################

def calculate_weights_and_apply_normalization(distances):
    distances_array = np.array([d[1] for d in distances])
    unnormalized_weights = 1 / (distances_array + epsilon)
    sum_unnormalized_weights = unnormalized_weights.sum()
    normalized_weights = unnormalized_weights / sum_unnormalized_weights
    return {
        'unnormalized': {distances[i][0]: unnormalized_weights[i] for i in range(len(distances))},
        'normalized': {distances[i][0]: normalized_weights[i] for i in range(len(distances))},
        'sum_unnormalized': sum_unnormalized_weights
    }

def predict_location(weights_dict):
    unnormalized_weights = weights_dict['unnormalized']
    normalized_weights = weights_dict['normalized']
    if all(weight == 1/epsilon for weight in unnormalized_weights.values()):
        return "Unknown"
    max_weight = max(normalized_weights.values())
    max_weight_locations = [location for location, weight in normalized_weights.items() if weight == max_weight]
    return max_weight_locations if len(max_weight_locations) > 1 else max_weight_locations[0]

def parse_csv_heatmap(csv_string):
    lines = csv_string.strip().split('\n')
    reader = csv.reader(lines)
    rows = list(reader)

    header = rows[0][1:]
    heatmap = {}

    for row in rows[1:]:
        location = row[0]
        rssi_values = row[1:]

        for bssid, rssi in zip(header, rssi_values):
            if bssid not in heatmap:
                heatmap[bssid] = {}
            heatmap[bssid][location] = int(rssi)

    return heatmap

############################## WIFI MAP LOCALIZATION ##############################

def WiFi_BSSID_RSSI_extractor(log_data):
    regex = r"BSSID: (.*?),.*?Level: (-\d+)"
    return re.findall(regex, log_data)

def WiFi_euclidean_distance(device_id_rssi, heatmap_dict):
    euclidean_distances = []

    for location in device_id_rssi:
        heatmap_rssi_values = []
        real_rssi_values = []

        for bssid in heatmap_dict:
            if location in heatmap_dict[bssid] and bssid in device_id_rssi[location]:
                heatmap_rssi_values.append(heatmap_dict[bssid][location])
                real_rssi_values.append(device_id_rssi[location][bssid])

        if heatmap_rssi_values and real_rssi_values:
            distance = math.sqrt(sum((a - b) ** 2 for a, b in zip(real_rssi_values, heatmap_rssi_values)))
            euclidean_distances.append((location, distance))

    if not euclidean_distances:
        return None, None

    return min(euclidean_distances, key=lambda x: x[1])

def WiFiLocalization(log_data, device_id, did, heatmap_string):
    matches = WiFi_BSSID_RSSI_extractor(log_data)
    heatmap_dict = parse_csv_heatmap(heatmap_string)
    console.log("HEATMAP DICT: ", heatmap_dict)

    # Convert matches into a dict: {bssid: rssi}
    observed_rssi = {bssid: int(rssi) for bssid, rssi in matches}

    # Fill in missing BSSIDs with -100
    complete_rssi = {}
    for bssid in heatmap_dict:
        if bssid in observed_rssi:
            complete_rssi[bssid] = observed_rssi[bssid]
        else:
            complete_rssi[bssid] = -100

    # Construct per-location device RSSI dictionary
    device_id_rssi = {location: {} for location in next(iter(heatmap_dict.values()))}
    for bssid, rssi in complete_rssi.items():
        for location in heatmap_dict[bssid]:
            device_id_rssi[location][bssid] = rssi

    # If all locations have empty RSSI dicts (shouldn’t happen now), return unknown
    if all(len(rssi_dict) == 0 for rssi_dict in device_id_rssi.values()):
        outputResult = {
            "Localization Algorithm": "Euclidean Distance (ED)",
            "Device ID": device_id,
            "Employee DID": did,
            "Estimated Location": "Unknown",
            "Access Status": "Outside Restricted Area"
        }
        sys.stdout.write(json.dumps(outputResult))
        return

    distance_threshold = 20
    estimated_location, min_distance = WiFi_euclidean_distance(device_id_rssi, heatmap_dict)

    if min_distance is not None and min_distance <= distance_threshold:
        access_status = "Inside Restricted Area"
    else:
        access_status = "Outside Restricted Area"
        estimated_location = "Unknown"

    outputResult = {
        "Localization Algorithm": "Euclidean Distance (ED)",
        "Device ID": device_id,
        "Employee DID": did,
        "Estimated Location": estimated_location,
        "Access Status": access_status
    }

    sys.stdout.write(json.dumps(outputResult))

######################################### MAIN #########################################
def main():
    log_data = sys.argv[1]
    device_id = sys.argv[2]
    did = sys.argv[3]
    heatmap_string = sys.argv[4]
    console.log("HEATMAP STRING: ", heatmap_string)

    if "WifiNetworkScannerN" in log_data:
        WiFiLocalization(log_data, device_id, did, heatmap_string)

if __name__ == "__main__":
    main()
