# Localization with LEAST SQUARES OPTIMIZATION

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

# ANSI escape code for red color
RED = "\033[91m"
RESET = "\033[0m"



def residuals(params, distances):
    """
    Residuals function for least squares optimization.
    
    Parameters:
    - params: Tuple (x, y) representing estimated coordinates
    - distances: List of tuples (ssid, bssid, x, y, r) representing APs and distances
    
    Returns:
    - Residuals as a list of differences between estimated and actual distances
    """
    x, y = params
    res = []
    for ssid, bssid, x_i, y_i, r_i in distances:
        res.append(np.sqrt((x - x_i)**2 + (y - y_i)**2) - r_i)
    return res

def WiFi_BSSID_RSSI_extractor(log_data):
    """
    Extracts BSSID and RSSI values from Wi-Fi log data.
    
    Parameters:
    - log_data: String containing Wi-Fi log data
    
    Returns:
    - List of tuples (SSID, BSSID, RSSI)
    """
    regex = r"SSID: (.*?), BSSID: (.*?),.*?Level: (-\d+)"
    matches = re.findall(regex, log_data)
    return matches

def rssi_to_distance(rssi, A, n=2):
    """
    Converts RSSI to distance using the log-distance path loss model.
    
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
    Converts latitude and longitude to local Cartesian coordinates relative to a local origin.
    
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
    Converts local Cartesian coordinates (x, y) to latitude and longitude.
    
    Parameters:
    - x, y: Cartesian coordinates
    - lat0, lon0: Latitude and longitude of the local origin
    - R: Radius of the Earth (default: 6371000 meters)
    
    Returns:
    - lat, lon: Latitude and longitude in degrees
    """
    lat0_rad = np.deg2rad(lat0)
    lon0_rad = np.deg2rad(lon0)
    
    lat_rad = y / R + lat0_rad
    lon_rad = x / (R * np.cos(lat0_rad)) + lon0_rad
    
    lat = np.rad2deg(lat_rad)
    lon = np.rad2deg(lon_rad)
    
    return lat, lon

def trilaterate(distances):
    """
    Estimate the coordinates (x, y) using least squares optimization.
    
    Parameters:
    - distances: List of tuples (ssid, bssid, x, y, r) representing APs and distances
    
    Returns:
    - Estimated coordinates (x, y)
    """
    x0 = np.mean([x for ssid, bssid, x, y, r in distances])
    y0 = np.mean([y for ssid, bssid, x, y, r in distances])

    result = least_squares(residuals, (x0, y0), args=(distances,))
    x, y = result.x

    fig, ax = plt.subplots()

    for i, (ssid, bssid, x_i, y_i, r_i) in enumerate(distances):
        theta = np.linspace(0, 2*np.pi, 100)
        circle_x = x_i + r_i * np.cos(theta)
        circle_y = y_i + r_i * np.sin(theta)
        color = plt.cm.tab10(i % 10)  # Cycle through 10 different colors
        ax.plot(circle_x, circle_y, linestyle='--', linewidth=1, color=color, label=f'{ssid} - {bssid} (r={r_i:.2f})')
    
    lat_est, lon_est = cartesian_to_lat_lon(x, y, lat0, lon0)
    ax.plot(x, y, 'ro', label=f'Estimated Location: ({lat_est}, {lon_est})')

    all_x = [x for ssid, bssid, x, y, r in distances] + [x]
    all_y = [y for ssid, bssid, x, y, r in distances] + [y]
    all_r = [r for ssid, bssid, x, y, r in distances]
    
    padding = max(all_r) * 1.5
    ax.set_xlim(min(all_x) - padding, max(all_x) + padding)
    ax.set_ylim(min(all_y) - padding, max(all_y) + padding)

    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_aspect('equal', adjustable='datalim')
    ax.legend()

    zoom_out_factor = 1.5
    xlim = ax.get_xlim()
    ylim = ax.get_ylim()
    ax.set_xlim(xlim[0] - zoom_out_factor * padding, xlim[1] + zoom_out_factor * padding)
    ax.set_ylim(ylim[0] - zoom_out_factor * padding, ylim[1] + zoom_out_factor * padding)

    plt.title('Least Squares Optimization: Circles and Estimated Location (Zoomed Out)')
    plt.grid(True)
    plt.show()

    return x, y


def WiFiLocalization(log_data, user, dir):
    """
    Perform Wi-Fi localization based on a predefined map in WiFi_MAP_Trilateration.csv.
    
    Parameters:
    - log_data: String containing Wi-Fi log data
    - user: Logged in user
    - dir: Directory path where WiFi_MAP_Trilateration.csv is located
    """
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
                        A = float(row['A'])
                        # Append coordinates and RSSI to the list
                        APsCartesianCoordinateX, APsCartesianCoordinateY = lat_lon_to_local_cartesian(latitude, longitude, lat0, lon0)
                        coordinates_and_rssi.append((ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi, A))
               
        # Convert RSSI values to distances
        distances = [(ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi_to_distance(int(rssi), int(A))) for ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi, A in coordinates_and_rssi]
        
        # Perform trilateration
        estimated_location = trilaterate(distances)
        
        # Convert estimated Cartesian coordinates to latitude and longitude
        lat_est, lon_est = cartesian_to_lat_lon(estimated_location[0], estimated_location[1], lat0, lon0)
        print(f"{RED}{user}: estimated Location (Latitude, Longitude) = {lat_est},{lon_est}{RESET}")

    else:
        print("Localization Trilateration Map is not defined")
            

############################################ WIFI MAP LOCALIZATION ############################################


# Step 1: Retrieve the real-time RSSI values received from these APs
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

# Entry point of the script
if __name__ == "__main__":
    main()
######################################### MAIN #########################################






