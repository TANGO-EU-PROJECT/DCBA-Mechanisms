# A python script that will perform the localization based on received logs containing Wifi RSSI values utilizing the Euclidean Distance Algorithm #
import sys
import os
import re
import csv
from math import sqrt
import json
import numpy as np
epsilon = 1e-10
import json
import math



############################## HELPER FUNCTIONS ##############################
# A function that performs the Weight KNN algorithm, by producing the corresponding weights for each distance and normalize them
def calculate_weights_and_apply_normalization(distances):
    # Convert distances to a numpy array for easier manipulation
    distances_array = np.array([d[1] for d in distances])
    
    # Calculate the weights as the inverse of distances
    # Adding a small epsilon to avoid division by zero
    unnormalized_weights = 1 / (distances_array + epsilon)

    # Store the sum of unnormalized weights
    sum_unnormalized_weights = unnormalized_weights.sum()

    # Normalize the weights so that they sum up to 1. This normalization step is essential for the weighted k-NN algorithm to work correctly, as it ensures 
    # that the contributions of the neighbors to the prediction are appropriately weighted and balanced.
    normalized_weights = unnormalized_weights / sum_unnormalized_weights
    
    # Return the weights as a dictionary
    # Return both unnormalized and normalized weights as dictionaries, along with the sum of unnormalized weights
    return {
        'unnormalized': {distances[i][0]: unnormalized_weights[i] for i in range(len(distances))},
        'normalized': {distances[i][0]: normalized_weights[i] for i in range(len(distances))},
        'sum_unnormalized': sum_unnormalized_weights
    }


# A function that given a set of locations and their weights, returns the most probable location(the one with the bigger probability/weight)
def predict_location(weights_dict):

    # Extract unnormalized and normalized weights and their sum
    unnormalized_weights = weights_dict['unnormalized']
    normalized_weights = weights_dict['normalized']
    sum_unnormalized_weights = weights_dict['sum_unnormalized']

    # Check if all unormalized-weights are equal to 1/epsilon (indicating all distances are zero, indicating that we didnt receive any RSSI signal from any Access Point existing in the heatmap file)
    if all(weight == 1/epsilon for weight in unnormalized_weights.values()):
        return "Unknown"
    
    # Else, find the maximum normalized weight value
    max_weight = max(normalized_weights.values())
    
    # Find all locations with this maximum normalized weight
    max_weight_locations = [location for location, weight in normalized_weights.items() if weight == max_weight]
    
    # Check if there is no single maximum weight
    if len(max_weight_locations) > 1:
        return max_weight_locations
    
    # If there is only one location with the maximum weight, return that location
    predicted_location = max_weight_locations[0]
    return predicted_location


############################## HELPER FUNCTIONS ##############################






############################################ WIFI MAP LOCALIZATION ############################################
# A function that extracts the WiFi BSSID and its RSSI we receive from it 
def WiFi_BSSID_RSSI_extractor(log_data):
    regex = r"BSSID: (.*?),.*?Level: (-\d+)"
    matches = re.findall(regex, log_data)
    return matches


# A function tha computes the Euclidean Distances based on the RSSI values received from the nearby APs #
def WiFi_euclidean_distance(did_rssi, heatmap_dict):
    """
    Computes the Euclidean distance between real-time RSSI values and the heatmap RSSI values,
    while handling missing AP values properly.
    """
    
    euclidean_distances = []
    
    for location in did_rssi:  # Iterate over each location in the heatmap
        heatmap_rssi_values = []
        real_rssi_values = []

        for bssid in heatmap_dict:
            if location in heatmap_dict[bssid] and bssid in did_rssi[location]:
                heatmap_rssi_values.append(heatmap_dict[bssid][location])
                real_rssi_values.append(did_rssi[location][bssid])

        # Compute Euclidean distance only if we have common APs
        if heatmap_rssi_values and real_rssi_values:
            euclidean_distance = math.sqrt(sum((a - b) ** 2 for a, b in zip(real_rssi_values, heatmap_rssi_values)))
            euclidean_distances.append((location, euclidean_distance))

    # Calculate weights based on distances
    weights = calculate_weights_and_apply_normalization(euclidean_distances)
    #print("POSSIBLE LOCATIONS:", weights['normalized'])

    # Predict the estimated location based on weights
    EstimatedLocation = predict_location(weights)
    return EstimatedLocation




        
# A Function to perform the WiFi Localization based on the pre-defined MAP, listed in the file WiFi_MAP.csv #
def WiFiLocalization(log_data, deviceDid, heatmap):
    """
    Perform WiFi localization based on RSSI values and a given heatmap.
    """

    # Extract BSSIDs and real RSSI levels from log data
    matches = WiFi_BSSID_RSSI_extractor(log_data)  # Returns a list of (BSSID, RSSI) pairs

    # Convert heatmap into a dictionary for efficient lookup (Only using AP_BSSID)
    heatmap_dict = {
        entry["AP_BSSID"]: {loc: int(entry[loc]) for loc in entry if loc not in ["AP_SSID", "AP_BSSID"]}
        for entry in heatmap
    }

    # Prepare a dictionary of real RSSI values **organized by location**
    did_rssi = {location: {} for location in next(iter(heatmap_dict.values()))}  # Initialize per location

    for bssid, real_rssi in matches:
        if bssid in heatmap_dict:  # Only use APs that exist in the heatmap
            for location in heatmap_dict[bssid]:  
                did_rssi[location][bssid] = int(real_rssi)  # Store real RSSI per location per BSSID

    # Calculate the estimated location using Euclidean distance
    EstimatedLocation = WiFi_euclidean_distance(did_rssi, heatmap_dict)

    outputResult = {
        "deviceDid": deviceDid,
        "Estimated Location": EstimatedLocation
    }

    # Output the result as JSON
    sys.stdout.write(json.dumps(outputResult))
############################################ WIFI MAP LOCALIZATION ############################################




######################################### MAIN #########################################
def main():
    # Get the log data from command line arguments
    log_data = sys.argv[1]
    # Get the logged in deviceDid
    deviceDid = sys.argv[2]
    # Get the deviceDid heatmap
    heatmap = sys.argv[3]

    # Now parse the JSON string 
    try:
        heatmap = json.loads(heatmap)  # Convert string to Python object (list of dictionaries)
    except json.JSONDecodeError as e:
        print(f"Error parsing heatmap: {e}")
        return

    # Need to declare if the RSSI values are Wifi or BLe 
    if ("WifiNetworkScannerN" in log_data):
        # Wi-Fi RSSI VALUES
        WiFiLocalization(log_data, deviceDid, heatmap)

# Entry point of the script
if __name__ == "__main__":
    main()
######################################### MAIN #########################################
