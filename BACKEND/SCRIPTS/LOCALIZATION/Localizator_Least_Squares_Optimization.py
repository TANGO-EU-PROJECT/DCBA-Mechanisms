# Localization with LEAST SQUARES OPTIMIZATION
# python3 "scripts/LOCALIZATION/Localizator_Least_Squares.py" "05-23 14:05:13.878  3415  3415 D WifiNetworkSelectorN: SSID: DIRECT-CJLAPTOP-63HL8KJOmsNX, BSSID: ea:f3:bc:bd:4a:63, Level: -49, SSID: ESPURNA-374E56, BSSID: de:4f:22:37:4e:56, Level: -51, SSID: nitlab, BSSID: c0:74:ad:9d:de:f6, Level: -52, SSID: nitlab, BSSID: c0:74:ad:9d:de:f5, Level: -54, SSID: nitlab-10.64.44.0/23, BSSID: b8:27:eb:73:d5:cc, Level: -63, SSID: nitlab, BSSID: 50:91:e3:11:37:50, Level: -66, SSID: U-WASH AP, BSSID: 9c:53:22:50:19:2a, Level: -75, SSID: Pet Stories, BSSID: 00:1d:1c:f5:81:37, Level: -78, SSID: dragino-27b70c, BSSID: aa:40:41:27:b7:0c, Level: -78, SSID: AUTOTERZIDIS, BSSID: 28:77:77:e2:45:c0, Level: -79, SSID: DIRECT-BF-HP DeskJet 5200 series, BSSID: 12:e7:c6:d4:6d:bf, Level: -79, SSID: DIRECT-38-HP PageWide 377dw MFP, BSSID: fe:3f:db:cf:8c:38, Level: -79, SSID: EYAGGELOU ELASTIKA, BSSID: a0:95:7f:ab:a6:31, Level: -82, SSID: tameiaki, BSSID: 62:95:7f:ab:a6:32, Level: -83, SSID: None, BSSID: None, Level: None " "sterlan"
import numpy as np
import sys
import os
import csv
import re
import matplotlib.pyplot as plt
from scipy.optimize import least_squares
import json
# Local coordinates. This is the reference point.
#lat0 = 39.36582263479573
#lon0 = 22.92377558170571

# Manual retrieving the coordinates from Google Maps(the center of the building)
lat0 = 39.365858279847544
lon0 = 22.923886333496505

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


def WiFiLocalization(log_data, deviceDid, heatmap):
    """
    Perform Wi-Fi localization using a predefined heatmap.

    Parameters:
    - log_data: String containing Wi-Fi log data
    - deviceDid: Logged-in deviceDid
    - heatmap: List of dictionaries containing AP data (SSID, BSSID, latitude, longitude, A)
    """
    # Ensure heatmap is a list of dictionaries
    if isinstance(heatmap, str):
        try:
            heatmap = json.loads(heatmap)  # Parse JSON string into a Python object
        except json.JSONDecodeError as e:
            print(f"Error parsing heatmap: {e}")
            return None

    if not isinstance(heatmap, list):
        print(f"Invalid heatmap format for deviceDid {deviceDid}: Expected a list of dictionaries.")
        return None

    # Extract BSSIDs and RSSI levels from log data
    matches = WiFi_BSSID_RSSI_extractor(log_data)

    # List to store coordinates and RSSI values
    coordinates_and_rssi = []

    for ap in heatmap:
        if isinstance(ap, dict):  # Ensure ap is a dictionary
            BSSID = ap.get('AP_BSSID')
            latitude = float(ap.get('latitude', 0))  # Default to 0 if missing
            longitude = float(ap.get('longitude', 0))  # Default to 0 if missing
            A = float(ap.get('A', 0))  # Default to 0 if missing

            # Check if any BSSIDs from log data match with the heatmap BSSID
            for match in matches:
                ssid, bssid, rssi = match
                if bssid == BSSID:  
                    # Convert latitude & longitude to local Cartesian coordinates
                    APsCartesianCoordinateX, APsCartesianCoordinateY = lat_lon_to_local_cartesian(latitude, longitude, lat0, lon0)
                    coordinates_and_rssi.append((ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi, A))

    if not coordinates_and_rssi:
        print(f"{RED}[----- deviceDid: {deviceDid}, No matching APs found in heatmap. Localization not possible. -----]{RESET}")
        return None

    # Convert RSSI values to distances
    distances = [
        (ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi_to_distance(int(rssi), int(A))) 
        for ssid, bssid, APsCartesianCoordinateX, APsCartesianCoordinateY, rssi, A in coordinates_and_rssi
    ]

    # Perform trilateration
    estimated_location = trilaterate(distances)

    # Convert estimated Cartesian coordinates to latitude and longitude
    lat_est, lon_est = cartesian_to_lat_lon(estimated_location[0], estimated_location[1], lat0, lon0)
    # Write the result to stdout (the result will be captured in JS)
    # Assume you have variables for lat_est and lon_est (latitude and longitude)
    outputResult = {
        "deviceDid": deviceDid,
        "Estimated Location (Latitude)": lat_est,
        "Estimated Location (Longitude)": lon_est
    }

    # Output only the valid JSON object
    sys.stdout.write(json.dumps(outputResult))

    return lat_est, lon_est  # Return estimated location

            

############################################ WIFI MAP LOCALIZATION ############################################


# Step 1: Retrieve the real-time RSSI values received from these APs
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






