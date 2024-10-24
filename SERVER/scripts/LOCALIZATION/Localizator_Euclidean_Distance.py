# A python script that will perform the localization based on Wifi & BLe RSSI values , presented in Android System Logs #
# run: python3 Localizator.py "04-22 14:59:22.129  4744  4744 D BLeScannerN: Found device: 37:C1:60:F6:01:91, BLeRSSI: -50" "stergios" #
import sys
import os
import re
import csv
from math import sqrt
import json
import numpy as np
epsilon = 1e-10


############################## ASSISTANCE FUNCTIONS ##############################

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

# A function that extracts the locations from a given .csv file 
def extract_locations_from_csv(csv_file):
    with open(csv_file, 'r') as file:
        reader = csv.reader(file)
        headers = next(reader)  # Read the first row to get column headers
        locations = [header for header in headers if header != 'WiFiAPs' and header != 'BLeAPs' and header != 'REAL_TIME_RSSI']
    return locations
############################## HELPER FUNCTIONS ##############################

















############################################ WIFI MAP LOCALIZATION ############################################
# A function that extracts the WiFi BSSID and its RSSI we receive from it 
def WiFi_BSSID_RSSI_extractor(log_data):
    regex = r"BSSID: (.*?),.*?Level: (-\d+)"
    matches = re.findall(regex, log_data)
    return matches


# A function tha computes the Euclidean Distances based on the RSSI values received from the nearby APs #
def WiFi_euclidean_distance(dir):
    # Define the path to the WiFi_MAP.csv file
    wifi_map_file = os.path.join(dir, 'WiFi_MAP.csv')

    # Check if the WiFi_MAP.csv file exists
    if os.path.exists(wifi_map_file):
        # Open the WiFi_MAP.csv file for reading
        with open(wifi_map_file, 'r', newline='') as f:
            reader = csv.reader(f)
            rows = list(reader)

            # Extract the locations from the Heatmap file .csv
            locations = extract_locations_from_csv(wifi_map_file)

            # Initialize list to store Euclidean distances
            euclidean_distances = []
            rssi_lists = {location: [] for location in locations}
            rssi_real_time = []

            # Find the index of the columns
            columns = rows[0]
            location_indexes = {location: columns.index(location) for location in locations}
            real_time_index = columns.index("REAL_TIME_RSSI")

            # Iterate through each row
            for row in rows[1:]:
                # Iterate over each location and append RSSI values
                for location, index in location_indexes.items():
                    rssi_lists[location].append(int(row[index]))
                
                # Check for each Access Point if we receiced RSSI Signal in real time.
                if row[real_time_index] != '':  # Check if the value is not empty
                    rssi_real_time.append(int(row[real_time_index]))
                else:
                    rssi_real_time.append(0)    # Use 0 if the value is empty

            
            # Iterate over each location and compute its Euclidean Distance
            for location, rssi_list in rssi_lists.items():
                # Compute the Euclidean distance between the RSSI values of the current location and real-time RSSI values
                euclidean_distance = sqrt(sum((a - b) ** 2 for a, b in zip(rssi_real_time, rssi_list) if a != 0))
                
                # Append the Euclidean distance along with the location name to the list
                euclidean_distances.append((location, euclidean_distance))

            # Calculate weights based on distances
            weights = calculate_weights_and_apply_normalization(euclidean_distances)
            print("POSSIBLE LOCATIONS: ", weights['normalized'])

             # Predict the location based on the weights
            EstimatedLocation = predict_location(weights)

            # Delete the content of the last column
            for row in rows[1:]:
                row[real_time_index] = ''

            # Write back the modified content to the file
            with open(wifi_map_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(columns)
                writer.writerows(rows[1:])
            return(EstimatedLocation)
    else:
        print("WiFi_MAP.csv file does not exist.")



        
# A Function to perform the WiFi Localization based on the pre-defined MAP, listed in the file WiFi_MAP.csv #
def WiFiLocalization(log_data, user, dir):
    # Define the path to the WiFi_MAP.csv file
    wifi_map_file = os.path.join(dir, 'WiFi_MAP.csv')

    # Extract BSSIDs and RSSI levels from log data
    matches = WiFi_BSSID_RSSI_extractor(log_data)

    # Check if the WiFi_MAP.csv file exists
    if os.path.exists(wifi_map_file):
        # Open the WiFi_MAP.csv file for reading and writing
        with open(wifi_map_file, 'r+', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = list(reader)
            #print(rows)

            # Read the first column of the CSV file
            bssids = [row[0] for row in rows]

            # Check if any BSSIDs from log data match with the BSSIDs in the CSV file
            for match in matches:
                bssid, rssi = match
                if bssid in bssids:
                    # Find the index of the matching BSSID
                    index = bssids.index(bssid)
                    # Append the RSSI value to the corresponding row at the correct position
                    rows[index][-1] = rssi
        

            # Write back the updated rows to the file
            f.seek(0)
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)
            f.truncate()

    # Calculate the possible Location of the Device based on these RSSI values, applying the euclidean formula #
    EstimatedLocation = WiFi_euclidean_distance(dir)

    outputResult = {
        "user": user,
        "Estimated Location(Based on WiFi RSSI)":EstimatedLocation
    }

    print(outputResult)
############################################ WIFI MAP LOCALIZATION ############################################

















############################################ BLe MAP LOCALIZATION ############################################
# A function that extracts the Ble BSSID and its RSSI we receive from it 
def BLe_BSSID_RSSI_extractor(log_data):
    regex = r"Device: (.*?), RSSI: (-\d+)"
    matches = re.findall(regex, log_data)
    return matches


# A function tha computes the Euclidean Distances based on the RSSI values of the nearby APs #
def BLe_euclidean_distance(dir):
     # Define the path to the WiFi_MAP.csv file
    BLe_map_file = os.path.join(dir, 'BLe_MAP.csv')

    # Check if the WiFi_MAP.csv file exists
    if os.path.exists(BLe_map_file):
        # Open the BLe_MAP.csv file for reading
        with open(BLe_map_file, 'r', newline='') as f:
            reader = csv.reader(f)
            rows = list(reader)

            # Extract the locations from the Heatmap file .csv
            locations = extract_locations_from_csv(BLe_map_file)

            # Initialize list to store Euclidean distances
            euclidean_distances = []
            rssi_lists = {location: [] for location in locations}
            rssi_real_time = []

            # Find the index of the columns
            columns = rows[0]
            location_indexes = {location: columns.index(location) for location in locations}
            real_time_index = columns.index("REAL_TIME_RSSI")

            # Iterate through each row
            for row in rows[1:]:
                # Iterate over each location and append RSSI values
                for location, index in location_indexes.items():
                    rssi_lists[location].append(int(row[index]))

                # Check for each Access Point if we receiced RSSI Signal in real time.
                if row[real_time_index] != '':  # Check if the value is not empty
                    rssi_real_time.append(int(row[real_time_index]))
                else:
                    rssi_real_time.append(0)    # Use 0 if the value is empty


            # Iterate over each location and compute its Euclidean Distance
            for location, rssi_list in rssi_lists.items():
                # Compute the Euclidean distance between the RSSI values of the current location and real-time RSSI values
                euclidean_distance = sqrt(sum((a - b) ** 2 for a, b in zip(rssi_real_time, rssi_list) if a != 0))
                
                # Append the Euclidean distance along with the location name to the list
                euclidean_distances.append((location, euclidean_distance))

            # Calculate weights based on distances
            weights = calculate_weights_and_apply_normalization(euclidean_distances)
            print("POSSIBLE LOCATIONS: ", weights['normalized'])

             # Predict the location based on the weights
            EstimatedLocation = predict_location(weights)

            # Delete the content of the last column
            for row in rows[1:]:
                row[real_time_index] = ''

            # Write back the modified content to the file
            with open(BLe_map_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(columns)
                writer.writerows(rows[1:])
            return(EstimatedLocation)

    else:
        print("WiFi_MAP.csv file does not exist.")



        
# A Function to perform the WiFi Localization based on the pre-defined MAP, listed in the file WiFi_MAP.csv #
def BLeLocalization(log_data, user, dir):
    # Define the path to the WiFi_MAP.csv file
    BLe_map_file = os.path.join(dir, 'BLe_MAP.csv')

    # Extract BSSIDs and RSSI levels from log data
    matches = BLe_BSSID_RSSI_extractor(log_data)

    # Check if the WiFi_MAP.csv file exists
    if os.path.exists(BLe_map_file):
        # Open the WiFi_MAP.csv file for reading and writing
        with open(BLe_map_file, 'r+', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = list(reader)

            # Read the first column of the CSV file
            bssids = [row[0] for row in rows]

            # Check if any BSSIDs from log data match with the BSSIDs in the CSV file
            for match in matches:
                bssid, rssi = match
                if bssid in bssids:
                    # Find the index of the matching BSSID
                    index = bssids.index(bssid)
                    # Append the RSSI value to the corresponding row at the correct position
                    rows[index][-1] = rssi
        

            # Write back the updated rows to the file
            f.seek(0)
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)
            f.truncate()

    # Calculate the possible Location of the Device based on these RSSI values, applying the euclidean formula #
    EstimatedLocation = BLe_euclidean_distance(dir)

    outputResult = {
        "user": user,
        "Estimated Location(Based on BLe RSSI)":EstimatedLocation
    }

    print(outputResult)
############################################ BLe MAP LOCALIZATION ############################################






######################################### MAIN #########################################
def main():
    # Get the log data from command line arguments
    log_data = sys.argv[1]
    # Get the logged in user
    user = sys.argv[2]
    dir = f'ANDROID LOGS/{user}'

    # Need to declare if the RSSI values are Wifi or BLe 
    if ("WifiNetworkSelectorN" in log_data):
        # Wi-Fi RSSI VALUES
        WiFiLocalization(log_data, user, dir)
    else:
        # BLe RSSI VALUES
        BLeLocalization(log_data, user, dir)
        print()

# Entry point of the script
if __name__ == "__main__":
    main()
######################################### MAIN #########################################





'''
WiFiAPs,SECOND_FLOOR_NITLAB,THIRD_FLOOR_NITLAB,REAL_TIME_RSSI
50:91:e3:11:37:50,-84,-38,
aa:40:41:27:b7:0c,-86,-44,
50:91:e3:11:37:4f,-86,-51,
d8:61:62:85:8b:d3,-82,-65,
c0:74:ad:9d:de:f5,-51,-66,
c0:74:ad:9d:de:f6,-59,-68,
de:4f:22:37:4e:56,-59,-73,
9c:53:22:50:19:2a,-80,-76,
b8:27:eb:73:d5:cc,-44,-82,
a0:95:7f:ab:a6:35,-79,-86,


WiFiAPs,THANASIS_KORAKIS_OFFICE,KITCHEN,WC,SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
de:4f:22:37:4e:56,-45,-47,-44,-48,-59,
c0:74:ad:9d:de:f5,-46,-51,-48,-58,-56,
ea:f3:bc:bd:4a:63,-49,-54,-54,-51,-61,
c0:74:ad:9d:de:f6,-53,-64,-60,-59,-61,
50:91:e3:11:37:50,-74,0,0,-79,0,
b8:27:eb:73:d5:cc,-75,-54,-56,-60,-35,
aa:40:41:27:b7:0c,-76,0,0,0,0,
9c:53:22:50:19:2a,-78,0,-82,0,0,
28:77:77:e2:45:c0,-83,0,0,-84,0,
12:e7:c6:d4:6d:bf,-85,0,0,0,0,
9c:97:26:bd:52:13,-86,0,0,0,0,
f4:f6:47:3a:ea:94,-89,0,0,0,0,
0e:8c:24:97:c6:76,0,-78,-84,0,0,
f4:f6:47:3a:ea:95,0,-89,0,0,0,
e8:1b:69:1d:bf:0b,0,-92,0,0,-89,
08:aa:89:78:53:8c,0,0,-80,-81,0,
ea:d8:d1:26:9d:e7,0,0,-82,0,0,
c4:a3:66:47:ab:c0,0,0,-83,0,0,
b4:43:0d:d2:a8:d4,0,0,-87,0,0,
08:aa:89:78:53:8d,0,0,-88,0,0,
0a:aa:89:7b:53:8d,0,0,-90,0,0,
88:00:33:77:d9:09,0,0,0,-86,0,
e2:19:cf:ca:d3:14,0,0,0,-88,0,
28:77:77:e2:45:c1,0,0,0,-89,0,
d8:61:62:85:8b:d3,0,0,0,0,-87,
04:71:53:9a:70:1b,0,0,0,0,-91,


WiFiAPs,THANASIS_KORAKIS_OFFICE,KITCHEN-WC-SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
24:32:1B:BE:42:EB,-62,-66,-75,
3A:61:16:DA:59:D6,-58,-59,-73,
64:68:70:20:1F:24,-82,-67,-76,


de:4f:22:37:4e:56,-48,-51,-52,-52,-56,
c0:74:ad:9d:de:f6,-51,-62,-63,-54,-61,
b8:27:eb:73:d5:cc,-62,-57,-55,-47,-39,
0e:8c:24:97:c6:76,-76,-83,-80,-74,-76,



BLeAPs,THANASIS_KORAKIS_OFFICE,KITCHEN-WC-SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
42:7E:F3:C3:E8:7C,-85,-100,-100,
24:32:1B:BE:42:EB,-62,-66,-75,
3A:51:71:E9:2A:13,-88,-98,-100,
3A:61:16:DA:59:D6,-59,-59,-73,
33:AA:91:89:32:6A,-83,-100,-100,
1E:8A:FB:9A:4A:D3,-91,-66,-100,
78:A2:F2:1A:E9:BC,-96,-100,-100,
20:64:92:BB:C0:D4,-96,-100,-100,
0C:B8:9B:1A:5A:BF,-96,-93,-100,
6B:AF:1E:D5:1F:E6,-96,-100,-100,
0C:AE:B0:DB:5D:F8,-85,-65,-100,
64:68:70:20:1F:24,-80,-67,-76,
D1:D5:02:6B:AB:D1,-97,-100,-100,
EC:0F:EB:CC:B1:83,-85,-100,-100,
77:FE:94:0B:74:09,-93,-100,-100,
61:8A:91:06:83:C1,-85,-100,-100,
C5:77:BC:BD:C8:BA,-88,-100,-100,
64:BA:AE:51:73:DA,-93,-100,-100,
56:F4:2C:1C:EB:4F,-99,-100,-100,
3F:08:C6:27:40:72,-100,-88,-100,
02:0C:CF:E7:D4:78,-100,-100,-59,
35:75:BB:3F:CB:36,-100,-100,-89,
6B:76:E1:23:50:3B,-100,-100,-86,
E7:98:D4:92:B9:C7,-100,-100,-98,
24:39:6B:06:44:C5,-100,-100,-94,
71:E5:6A:7D:65:C7,-100,-100,-91,
77:C1:F2:FE:25:74,-100,-100,-91,
F9:0A:4E:A2:89:85,-100,-100,-91,
4F:15:60:E8:94:57,-100,-100,-93,
1D:DE:AC:EE:6E:1D,-100,-100,-93,
58:80:3C:C4:14:81,-100,-100,-67,
EF:41:9B:AA:93:29,-100,-100,-93,

BLE MAP
BLeAPs,THANASIS_KORAKIS_OFFICE,KITCHEN-WC-SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
07:41:84:83:8E:FB,-91,-89,-96,
7B:2B:90:13:E3:C7,-69,-73,-79,
20:62:D6:17:34:D0,-65,-61,-89,
0E:62:EE:BC:8F:29,-94,-71,-57,
64:68:70:20:1F:24,-72,-77,-63,
43:70:2F:C8:FD:FF,-77,-70,-62,
16:5C:D3:6B:C1:F9,-63,-69,-86,


WIFI MAP OLD (perfect, high accuracy)
WiFiAPs,THANASIS_KORAKIS_OFFICE,KITCHEN-WC-SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
de:4f:22:37:4e:56,-43,-46,-56,
c0:74:ad:9d:de:f6,-52,-58,-61,
b8:27:eb:73:d5:cc,-67,-53,-39,
0e:8c:24:97:c6:76,-76,-79,-76,

WIFI MAP NEW (perfect almost)
WiFiAPs,THANASIS_KORAKIS_OFFICE,KITCHEN-WC-SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
ea:f3:bc:bd:4a:63,-44,-48,-57,
c0:74:ad:9d:de:f6,-53,-57,-65,
de:4f:22:37:4e:56,-53,-36,-49,
c0:74:ad:9d:de:f5,-54,-49,-62,
b8:27:eb:73:d5:cc,-67,-68,-43,
50:91:e3:11:37:4f,-86,-85,-87,
0e:8c:24:97:c6:76,-76,-79,-76,


WiFiAPs,THANASIS_KORAKIS_OFFICE,KITCHEN-WC-SERVER_ROOM,EKETA_OFFICE,REAL_TIME_RSSI
ea:f3:bc:bd:4a:63,-44,-48,-57,
c0:74:ad:9d:de:f6,-53,-57,-65,
de:4f:22:37:4e:56,-53,-36,-49,
c0:74:ad:9d:de:f5,-54,-49,-62,
b8:27:eb:73:d5:cc,-67,-68,-37,
50:91:e3:11:37:4f,-86,-85,-87,
0e:8c:24:97:c6:76,-76,-79,-76,
50:91:e3:11:37:50,-68,-100,-100,
aa:40:41:27:b7:0c,-74,-100,-100,
9c:53:22:50:19:2a,-76,-100,-100,
00:1d:1c:f5:81:37,-77,-100,-100,
28:77:77:e2:45:c0,-78,-100,-77,
fe:3f:db:cf:8c:38,-83,-100,-100,
f4:f6:47:3a:ea:95,-85,-100,-86,
a0:95:7f:ab:a6:31,-86,-100,-83,
62:95:7f:ab:a6:32,-87,-100,-83,
28:77:77:e2:45:c1,-100,-82,-79,
ea:d8:d1:26:9d:e7,-100,-86,-100,
08:aa:89:78:53:8c,-100,-91,-100,
e8:1b:69:1d:bf:0b,-100,-100,-84,
b4:43:0d:d2:a8:d4,-100,-100,-86,
84:16:f9:46:44:18,-100,-100,-87,
00:26:44:09:de:9f,-91,-100,-100,





'''