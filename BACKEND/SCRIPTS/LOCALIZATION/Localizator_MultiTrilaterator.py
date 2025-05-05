# Localization with TRILATERATION #

import numpy as np
import sys
import os
import csv
import re
import matplotlib.pyplot as plt
from scipy.optimize import least_squares

# Local coordinates. This is the reference point.
lat0 = 39.36582263479573
lon0 = 22.92377558170571


def WiFi_BSSID_RSSI_extractor(log_data):
    """
    Function to extract BSSID and RSSI values from log data
    """
    regex = r"SSID: (.*?), BSSID: (.*?),.*?Level: (-\d+)"
    matches = re.findall(regex, log_data)
    return matches

def rssi_to_distance(rssi, A, n=2):
    """
    Convert RSSI to distance using the logarithmic distance path loss model.
    
    Parameters:
    - rssi: Received Signal Strength Indicator (in dBm)
    - A: RSSI at 1 meter distance (default: -40 dBm)
    - n: Path loss exponent (default: 2)
    
    Returns:
    - Distance in meters
    """
    return 10 ** ((A - rssi) / (10 * n))

def lat_lon_to_local_cartesian(lat, lon, lat0, lon0, R=6371000):
    """
    Convert latitude and longitude to local Cartesian coordinates using a local origin.
    
    Parameters:
    - lat: Latitude of the point
    - lon: Longitude of the point
    - lat0: Latitude of the local origin
    - lon0: Longitude of the local origin
    - R: Radius of the Earth (default: 6371000 meters)
    
    Returns:
    - x, y: Cartesian coordinates relative to the local origin
    """
    lat_rad = np.deg2rad(lat)
    lon_rad = np.deg2rad(lon)
    lat0_rad = np.deg2rad(lat0)
    lon0_rad = np.deg2rad(lon0)
    
    dlat = lat_rad - lat0_rad
    dlon = lon_rad - lon0_rad
    
    x = R * dlon * np.cos((lat_rad + lat0_rad) / 2)
    y = R * dlat
    
    return x, y


def cartesian_to_lat_lon(x, y, lat0, lon0, R=6371000):
    """
    Convert local Cartesian coordinates (x, y) to latitude and longitude.
    
    Parameters:
    - x, y: Cartesian coordinates
    - lat0, lon0: Latitude and longitude of the local origin
    - R: Radius of the Earth (default: 6371000 meters)
    
    Returns:
    - lat, lon: Latitude and longitude in degrees
    """
    # Convert origin latitude and longitude to radians
    lat0_rad = np.deg2rad(lat0)
    lon0_rad = np.deg2rad(lon0)
    
    # Calculate latitude in radians
    lat_rad = y / R + lat0_rad
    
    # Calculate longitude in radians
    lon_rad = x / (R * np.cos(lat0_rad)) + lon0_rad
    
    # Convert radians to degrees
    lat = np.rad2deg(lat_rad)
    lon = np.rad2deg(lon_rad)
    
    return lat, lon


def trilaterate(distances):
    """
    RESEARCH: https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=6559592&tag=1, https://math.stackexchange.com/questions/884807/find-x-location-using-3-known-x-y-location-using-trilateration
    Perform trilateration to estimate the location based on distances to APs.
    
    Parameters:
    - distances: List of tuples (ssid, bssid, x, y, r) representing APs and distances
    
    Returns:
    - Estimated coordinates (x, y)
    """
    num_aps = len(distances)

    # Extracting values from the variable distances
    ssids = [distance[0] for distance in distances]
    bssids = [distance[1] for distance in distances]
    coordinates = [(distance[2], distance[3]) for distance in distances]
    radii = [distance[4] for distance in distances]

    # Construct matrix A (num_aps-1 x 2)
    A = np.zeros((num_aps-1, 2))
    for i in range(num_aps - 1):
        xi, yi = coordinates[i]
        x4, y4 = coordinates[-1]
        A[i, 0] = 2 * (xi - x4)
        A[i, 1] = 2 * (yi - y4)

    # Construct vector b (num_aps-1 x 1)
    b = np.zeros((num_aps-1, 1))
    for i in range(num_aps - 1):
        ri = radii[i]
        r4 = radii[-1]
        xi, yi = coordinates[i]
        x4, y4 = coordinates[-1]
        b[i] = (r4**2 - ri**2) + xi**2 - x4**2 + yi**2 - y4**2

    try:
        # Calculate A^T * A (2x2 matrix)
        ATA = np.dot(A.T, A)

        # Calculate A^T * b (2x1 vector)
        ATb = np.dot(A.T, b)

        # Solve for X using normal equations: ATA * X = ATb
        X = np.linalg.solve(ATA, ATb)
        x, y = X.flatten()
        lat_est, lon_est = cartesian_to_lat_lon(x, y, lat0, lon0)
    

        # Plotting circles
        fig, ax = plt.subplots()

        # Plot circles with centers and radii
        for i in range(num_aps):
            ssid = distances[i][0]
            bssid = distances[i][1]
            xi, yi = coordinates[i]
            ri = radii[i]
            ax.add_artist(plt.Circle((xi, yi), ri, color='C'+str(i), fill=False, label=f'{ssid} - {bssid} (r={ri})'))

        # Plot estimated location
        ax.plot(x, y, 'ro', label=f'Estimated Location: ({lat_est}, {lon_est})')

        # Set plot limits based on circle centers and radii
        min_x = min(xi - ri for xi, _ in coordinates for ri in radii)
        max_x = max(xi + ri for xi, _ in coordinates for ri in radii)
        min_y = min(yi - ri for _, yi in coordinates for ri in radii)
        max_y = max(yi + ri for _, yi in coordinates for ri in radii)
        ax.set_xlim(min_x, max_x)
        ax.set_ylim(min_y, max_y)

        # Set labels and legend
        ax.set_xlabel('X')
        ax.set_ylabel('Y')
        ax.set_aspect('equal', adjustable='datalim')
        ax.legend()

        plt.title('Multi-Trilateration: Circles and Estimated Location')
        plt.grid(True)
        plt.show()

        # Return estimated coordinates
        return x, y

    except np.linalg.LinAlgError:
        print("Singular matrix: trilateration cannot be performed.")
        return None, None


def WiFiLocalization(log_data, user, dir):
    '''
    Function to perform WiFi localization based on a predefined map
    '''
    # Define the path to the WiFi_MAP.csv file
    wifi_map_file = os.path.join(dir, 'WiFi_MAP_Trilateration.csv')

    # Extract BSSIDs and RSSI levels from log data
    matches = WiFi_BSSID_RSSI_extractor(log_data)

    # List to store coordinates and RSSI values
    coordinates_and_rssi = []

    # Check if the WiFi_MAP.csv file exists
    if os.path.exists(wifi_map_file):
        # Open the WiFi_MAP.csv file for reading with DictReader
        with open(wifi_map_file, 'r', newline='') as f:
            reader = csv.DictReader(f)
            # Iterate over each row in the CSV file
            for row in reader:
                # Extract BSSID from the row dictionary
                BSSID = row['BSSID']
                # Check if any BSSIDs from log data match with the BSSIDs in the CSV file
                for match in matches:
                    ssid, bssid, rssi = match
                    if bssid == BSSID:  # Check if BSSID is in log data matches
                        # Retrieve data from the CSV row
                        latitude = float(row['latitude'])
                        longitude = float(row['longitude'])
                        A = int(row['A'])
                        # Append coordinates and RSSI to the list
                        APsCartesianCoordinateX, APsCartesianCoordinateY = lat_lon_to_local_cartesian(latitude, longitude, lat0, lon0)
                        coordinates_and_rssi.append((ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, int(rssi), A))
               
        # Convert RSSI values to distances
        distances = [(ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi_to_distance(int(rssi), int(A))) for ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi, A in coordinates_and_rssi]
        
        # Perform trilateration
        estimated_location = trilaterate(distances)
       # Convert estimated Cartesian coordinates to latitude and longitude
        lat_est, lon_est = cartesian_to_lat_lon(estimated_location[0], estimated_location[1], lat0, lon0)
        print(f"Estimated Location (Latitude, Longitude) = {lat_est},{lon_est}")
    else:
        print("Localization Trilateration Map is not defined")




"""
MAIN
"""
######################################### MAIN #########################################
def main():
    
    # Step 1: Retrieve the real-time RSSI values received from these APs
    # Get the log data from command line arguments
    log_data = sys.argv[1]
    # Get the logged in user
    user = sys.argv[2]
    dir = f'ANDROID LOGS/{user}'

    # Need to declare if the RSSI values are Wifi or BLe 
    if ("WifiNetworkSelectorN" in log_data):
        # Wi-Fi RSSI VALUES
        WiFiLocalization(log_data, user, dir)

# Entry point of the script
if __name__ == "__main__":
    main()
######################################### MAIN #########################################

