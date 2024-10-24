# A file that will parses and drains the most crucial data from the unprocessed Android Log data #
# A modified parser for the parsing of Android Log Data                                          #
# Original parser: https://github.com/logpai/logparser                                           #




########################################### IMPORTS ###########################################
import sys
sys.path.append('../')

import subprocess
import os
import re
import json
import pandas as pd
from collections import defaultdict
from tqdm import tqdm
import numpy as np
import regex as re
import os
import pandas as pd
import hashlib
from datetime import datetime
from transformers import BertTokenizer, BertModel
import torch
import ast
import time
import csv
from sklearn.cluster import OPTICS
from sklearn.preprocessing import StandardScaler
from scipy.cluster.hierarchy import dendrogram, linkage
import matplotlib.pyplot as plt
########################################### IMPORTS ###########################################

########################################### WINDOW SIZE & ANDROID LOG FORMAT ###########################################
window_size = 20
log_format = '<Date> <Time> <Pid> <Tid> <Level> <Tag>: <Content>'      
########################################### WINDOW SIZE & ANDROID LOG FORMAT ###########################################



########################################### REGULAR EXPERSSIONS FOR DATA DRAINING ###########################################
AndroidLogsRegex = [
            # Using Regular Expressions, the data realted to four interfaces are drained #

            # TAG: "WiFiService"
             r"(?<=uid=)\d+",
             r"(?<=setTxPower ===>>>)(\s*\d*)",
             r"(?<=lockMode=)\d+",


            # TAG: "StatusBar"
            r"(?<=level = )\d+",
            r"(?<=disable<)([^>]+)|(?<=disable2<)([^>]+)",
            r"(?<=StatusBarWindowView\{)[^}]+",
            r"(?<=canPanelBeCollapsed\(\): )\S+",

            # TAG: "LPPeService"
            r"(?<=lbsBatteryChanged\(\) level=\[)\d+(?=\])",
            r"(?<=scale=\[)\d+(?=\])",
            r"(?<=percentage=\[)\d+(?=\])",

            # TAG: "AdapterState" -> Nothing to drain

            # TAG: "BluetoothAdapterService"
            r"(?<=Broadcasting state TURNING_OFF to )\d+",
            r"(?<=Broadcasting state TURNING_ON to )\d+",
            r"(?<=getAdapterService\(\) - ).*",
            r"(?<=mRunningProfiles\.size\(\) = )\d+",
            r"(?<=Broadcasting state ON to )\d+",
            r"(?<=Broadcasting state BLE_ON to )\d+",
            r'(?<=com\.android\.bluetooth\.btservice\.AdapterService@)[^\s]+',
            r'(?<=Enable called with quiet mode status =)\s*\S+',
            r'(?<=updateAdapterState\(\) - Broadcasting state BLE_TURNING_OFF to )\d+',
            r'(?<=updateAdapterState\(\) - Broadcasting state BLE_TURNING_ON to )\d+',
            r'(?<=updateAdapterState\(\) - Broadcasting state OFF to )\d+',


            # TAG: "BluetoothDatabase"
            r"(?<=getCustomMeta: device )([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})",
            r"(?<=createMetadata )([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})",
            r"(?<=updateDatabase )([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})",
            r"(?<=deleteDatabase: )([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})",
            r'(?<=setProfilePriority: )([0-9A-Fa-f:]+)',
            r"(?<=profile=)-?\d+",
            r"(?<=priority = )-?\d+",
            r'(?<=getProfilePriority: )([0-9A-Fa-f:]+)',

            # TAG: "CachedBluetoothDevice"
            r"(?<=updating profiles for ).*",
            r"(?<=Class: )\d+",
            r"\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b",
            r"(?<=Time since last connect=)\d+",
            r"(?<= Address:)[0-9A-Fa-f:]+",
            r"(?<= Profile:)\w+",
            r"(?<=Preferred profiles = )[+-]?\d+",
            r"(?<= profile )\w+",
            r"(?<= device=)[0-9A-Fa-f:]+", 
            r"(?<= newProfileState )[+-]?\d+",
            r"(?<=Failed to connect ).*$",
            r'(?<=Device name:\s*).*',

            # TAG: "WifiDisplayController"
            r'(?<=networkInfo=)\[.*?\]$',
            r'(?<=mThisDevice= Device: ).*$',
            r'(?<=deviceAddress: )\S+',
            r'(?<=secondary type: )\S+',
            r'(?<=primary type: )\S+',
            r'(?<=wps: )\S+',
            r'(?<=grpcapab: )\S+',
            r'(?<=devcapab: )\S+',
            r'(?<=status: )\S+',
            r'(?<=wfdInfo: )\S+',

            # TAG: "NetworkInfoNotification"
            r'(?<=NetworkInfoNotification\$Listener\.onReceive\(\):)\d+',
            r'(?<=isAirplaneModeOn\s*=\s*)\w+',

            # TAG: "WifiConfigManager"
            r'(?<=configKey=)"([^"]+)"',
            r'(?<=at=time=)(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})',

            # TAG: "WifiClientModeImpl"
            r'(?<=ifaceName = ).+',
            r'(?<=ifacename = ).+',
            r'(?<=Setting OUI to ).+',
            r'(?<=nid=)[+-]?\d+',
            r'(?<=roam=)[a-zA-Z0-9_]+',
            r'(?<=ConnectedMacRandomization SSID\()[^)]+',
            r'(?<=\. setMacAddress\()[^)]+',
            r'(?<=from )[\w:]+(?= = true)',
            r'(?<=Connecting with )[\da-fA-F:]+(?= as the mac address)',
            r'(?<=Start Disconnecting Watchdog )[-+]?\d+',
            r'(?<=connectToUserSelectNetwork netId )\d+',
            r'(?<=uid )\d+',
            r'(?<=forceReconnect = )\w+',

            # TAG: "MtkConnectivityService"
            r'(?<=reportNetworkConnectivity\()[^)]+',
            r'(?<= by )\d+',
            r'(?<=NetworkAgentInfo \[)[^\]]+',
            r'(?<=cap=\[)[^\]]+',
            r'(?<=SignalStrength: )-?\d+',
            r'(?<=SSID: ")[^"]+',
            r'(?<=was satisfying )-?\d+',
            r'(?<=for type )-?\d+',
            r'(?<=type: )[^,]+',
            r'(?<=reason: \()[^)]+(?=\))',
            r'(?<=extra: \()[^)]+(?=\))',
            r'(?<=failover: )\w+',
            r'(?<=available: )\w+',
            r'(?<=roaming: )\w+',
            r'(?<=network{)\d+(?=})',
            r'(?<=nethandle{)\d+(?=})',
            r'(?<=lp{{)[^}]+(?=}})',
            r'(?<=nc{)[^]]+(?=])',
            r'(?<=Score{)\d+(?=})',
            r'(?<=everValidated{)[^}]+(?=})',
            r'(?<=lastValidated{)[^}]+(?=})',
            r'(?<=created{)[^}]+(?=})',
            r'(?<=lingering{)[^}]+(?=})',
            r'(?<=explicitlySelected{)[^}]+(?=})',
            r'(?<=acceptUnvalidated{)[^}]+(?=})',
            r'(?<=everCaptivePortalDetected{)[^}]+(?=})',
            r'(?<=lastCaptivePortalDetected{)[^}]+(?=})',
            r'(?<=captivePortalValidationPending{)[^}]+(?=})',
            r'(?<=partialConnectivity{)[^}]+(?=})',
            r'(?<=acceptPartialConnectivity{)[^}]+(?=})',
            r'(?<=mBaseIface: )\w+(?=,|$)',
            r'(?<=mIface: )\w+(?=,|$)',
            r'(?<=mState: )\w+',
            r'(?<=Setting DNS servers for network )\d+',
            r'(?<=to \[)[^]]+(?=\])',
            r'(?<=Adding iface wlan0 to network )\d+',
            r'(?<=Blocked status changed to )(true|false)\b|\b(?<=for )(\d+)\b|\b(?<=\()(\d+)\b|\b(?<=on netId )(\d+)\b',
            r'(?<=uid/pid:)\d+/\d+',
            r'(?<=NetworkRequest \[)[^\]]+',
            r'(?<=\bandroid\.os\.BinderProxy@)[a-fA-F0-9]+',
            r'(?<=isDefaultNetwork\s*=\s*)\w+',
            r'(?<=PnoSettings )\{[^}]+\}',

            # TAG: "DhcpClient"
            r'(?<=Received packet: )[\da-fA-F:]+',
            r'(?<=ip /)[\d.]+',
            r'(?<=mask /)[\d.]+',
            r'(?<=DNS servers: )[\d./ ]+(?=,)',
            r'(?<=gateways \[)[/\d.]+',
            r'(?<=DhcpResults@)\w+',
            r'(?<=DHCP server )\/[\d.]+',
            r'(?<=ciaddr=)[\d.]+',
            r'(?<=ciaddr=)[\w.]+',
            r'(?<=request=)[\d.]+',
            r'(?<=request=)[\w.]+',
            r'(?<=serverid=)[\d.]+',
            r'(?<=serverid=)[\w.]+',
            r'(?<=your new IP /)[\d.]+',
            r'(?<=Scheduling renewal in )\d+s',
            r'(?<=Scheduling rebind in )\d+s',
            r'(?<=Scheduling expiry in )\d+s',
            r'\/([\d.]+:\d+)',
            r"(?<=, lease time )\S+",

            # TAG: "WifiNetworkSelector"
            r'(?<=Networks filtered out due to low signal strength: ).*',
            r'(?<=SavedNetworkEvaluator selects ).*',
            r'(?<=BubbleFunScorer_v1 would choose )\d+',
            r'(?<=score )([\d.+-]+)\+/-([\d.]+)',
            r'(?<=expid )\d+',
            r'(?<=chooses )\d+',
            r'(?<=chooses\s)-?\d+',
            r'(?<=choose\s)-?\d+',
            r'(?<=choose )\d+',
            r'(?<=ScoreCardBasedScorer would choose )\d+',
            r'(?<=Too short since last network selection: )\d+',
            r'(?<=Current connected network: )"[^"]+"',
            r'(?<=ID: )\d+',
            r'(?<=Current network RSSI\[)[-\d]+(?=\])',
            r'(?<=Networks filtered out due to invalid SSID: ).*',
            r'.*?(?=("":"|\s)reason=NETWORK_SELECTION_DISABLED_NO_INTERNET_TEMPORARY)',
            r'(?<=count=)\d+',
            r'(?<=score\s)-?Infinity\+/-Infinity',
            
            # TAG: "SettingsState"
            r'(?<=value=)\d+',
            r'(?<=default=)\d+',
            r'(?<=packageName=)[^ ]+',
            r'(?<=name=)[^ ]+',
            r'(?<=value=)[^ ]+',
            r'(?<=gps=)[^ ]+',
            r'(?<=default=)[^ ]+',
            r'(?<=tag=)[a-zA-Z0-9_]+',
            r'(?<=defaultFromSystem=)[a-zA-Z0-9_]+',
            r'(?<=addHistoricalOperationLocked type persistsetting: )\w+',

            # TAG: "ConnectivityPacketTracker.wlan0" -> Nothing to drain

            # TAG: "WifiConnectivityManager"
            r'(?<=screenOn=)\w+',
            r'(?<=wifiState=)\w+',
            r'(?<=scanImmediately=)\w+',
            r'(?<=wifiEnabled=)\w+',
            r'(?<=wifiConnectivityManagerEnabled=)\w+',
            r'(?<=intervalMs: )\d+',
            r'(?<=AllSingleScanListener:  WNS candidate-")[^"]+',
            r'(?<=connectToNetwork: Connect to )"[^"]+"',
            r'(?<=enable )([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})(?= reason code)',
            r'(?<=reason code )-?\d+',
            r'(?<=Last periodic single scan started )\d+(?=ms ago)',
            r'(?<=connectToNetwork: Either already connected or is connecting to ).*',
            r'(?<=PnoScanListener:  WNS candidate-).*',

            # TAG: "WifiScanningService"
            r'(?<=android\.os\.Messenger@)\w+',
            r'(?<=Id=)\d+',
            r'(?<=results=)\d+',
            r'(?<=WorkSource{)[^}]+',
            r'(?<=ScanSettings {)[^}]+',
            r'(?<=reason=)-?\d+',
            r'(?<=max buckets=)\d+',
            r'(?<=Id=)-?\d+',

            # TAG: "netd"
            r'(?<=interfaceGetCfg\(")\w+(?="\))',
            r'(?<=<)\d+\.\d+ms(?=>)',
            r'(?<=interfaceSetEnableIPv6\()[^)]+(?=\))',
            r'(?<=interfaceClearAddrs\()[^)]+(?=\))',
            r'(?<=idletimerRemoveInterface\()[^)]+(?=\))',
            r'(?<=interfaceSetIPv6PrivacyExtensions\()[^)]+(?=\))',
            r'(?<=setIPv6AddrGenMode\()[^)]+(?=\))',
            r'(?<=setProcSysNet\()[^)]+(?=\))',
            r'(?<=networkAddRoute\()[^)]+(?=\))',
            r'(?<=ServiceSpecificException\()[^)]+(?=\))',
            r'(?<=DnsResolverService::setResolverConfiguration\()[^)]+(?=\))',
            r'(?<=-> \()([-+]?\d+)',
            r'\([^)]+ms\)',
            r'(?<=networkCreatePhysical\()[^)]+(?=\))',
            r'(?<=networkAddInterface\()[^)]+(?=\))',
            r'(?<=idletimerAddInterface\()[^)]+(?=\))',
            r'(?<=firewallSetUidRule\()[^)]+(?=\))',
            r'(?<=firewallEnableChildChain\()[^)]+(?=\))',
            r'(?<=firewallReplaceUidChain\().*?(?=\))',
            r'(?<=-> \{).*?(?=\})',
            r'(?<=socketDestroy\(\[).*?(?=\]\))',
            r'(?<=trafficSetNetPermForUids\().*?(?=\))',
    

            # TAG: "WifiNetworkSelectorN" & "BLeScannerN" are generated through Authenticator app, and they do not determine the devices behaviour. They used only for the Localization

]
########################################### REGULAR EXPERSSIONS FOR DATA DRAINING ###########################################

########################################### DICTIONARY FOR EVENT MAPPING TO INTEGERS ###########################################
'''


event_id_encoding = {
    # 0 -> Left Empty for BERT's Padding Token: [PAD] Token ID: 0
    'e0333fea': 1,
    'b1c8b88a': 2,
    'b1703108': 3,
    'c0d4b65a': 4,
    'ccd6c53c': 5,
    '529097e6': 6,
    'cfa278e4': 7,
    '80bc95b9': 8,
    '04dcf4d8': 9,
    '53259934': 10,
    '6dcfcd35': 11,
    'd3eb1dc8': 12,
    'f1c7fbea': 13,
    '2ba76956': 14,
    '18a6f17f': 15,
    'f27f2a35': 16,
    'ff52c40c': 17,
    '72b0c0a8': 18,
    'de7f4769': 19,
    '9fb77b2f': 20,
    'be585143': 21,
    '3c7b0eb7': 22,
    '7ef91619': 23,
    'd5ffc64a': 24,
    '5bbfa3a7': 25,
    '8e727430': 26,
    '48430d31': 27,
    'a9bef6c3': 28,
    '424c56ce': 29,
    '6b93a33f': 30,
    'bb1fb65d': 31,
    '68ab8e7b': 32,
    'f3343712': 33,
    '33e76f53': 34,
    '6f3ac002': 35,
    '2f92256d': 36,
    '4b5659c9': 37,
    '53b984b2': 38,
    '2d588913': 39,
    'b8e2dcb3': 40,
    '7cb58ba0': 41,
    'bdd00854': 42,
    '8880a59b': 43,
    'e6a41115': 44,
    '30f12103': 45,
    'c3086ce2': 46,
    '519f0641': 47,
    'f5ac84f4': 48,
    'e8975247': 49,
    'fa236e38': 50,
    'c3dc3022': 51,
    'ed2d8ce9': 52,
    '4772aaf2': 53,
    'fedc6918': 54,
    'b2600620': 55,
    'c057e88d': 56,
    '6784bde2': 57,
    '0b05e9b6': 58,
    'ee6793b7': 59,
    '7a2086f6': 60,
    '565d6ecd': 61,
    '8c9c27a1': 62,
    'bfa004d5': 63,
    'e1361802': 64,
    '35b1628c': 65,
    'bb362f8b': 66,
    'b5c447ae': 67,
    '5cb4e8d8': 68,
    '2bdfac2b': 69,
    '86bb9fdc': 70,
    'd3b03538': 71,
    '65a0a7ae': 72,
    'b8473e49': 73,
    '0ee13fb6': 74,
    '8ba163e7': 75,
    'fb45d262': 76,
    '9fd15fbd': 77,
    '1e90dc3a': 78,
    'f102432e': 79,
    '4faed6bd': 80,
    'e0eeb75b': 81,
    '0833b979': 82,
    'd40a153c': 83,
    '45fae511': 84,
    'e429bfbc': 85,
    '6582cbc3': 86,
    'b074c5ec': 87,
    'f7026487': 88,
    '4f21e485': 89,
    'b970e6c6': 90,
    '8e122d07': 91,
    '56eda9aa': 92,
    'dac2520c': 93,
    '070fded0': 94,
    'fa7a4aa4': 95,
    'c5dd8fcd': 96,
    '587cfc41': 97,
    '99fd1688': 98,
    '3c474860': 99,
    # 100 left for the [UNK] token of the BERT
    # 101 left for the [CLS] token of the BERT
    # 102 left for the [SEP] token of the BERT
    # 103 left for the [MASK] token of the BERT
    '0f9887aa': 104,
    '54aaf697': 105,
    '94f7e119': 106,
    'f3081b6f': 107,
    '48701882': 108,
    '7e45e0b3': 109,
    'd1c33399': 110,
    'aee83d1d': 111,
    '0e3f9e93': 112,
    '13c23555': 113,
    '67a80ded': 114,
    'd54e2934': 115,
    'ddc24099': 116,
    '4eee654a': 117,
    'bcd18f97': 118,
    'd32c3c94': 119,
    '0f93175b': 120,
    'de8faf4c': 121,
    '91aefa6c': 122,
    'b1d821d9': 123,
    '26b8b067': 124,
    'ddc1043c': 125,
    'c5439c5b': 126,
    '727a1678': 127,
    'c04d5365': 128,
    '54834923': 129,
    'f5981146': 130,
    '4ca77991': 131,
    '6ba2c61f': 132,
    '50fb7a43': 133,
    '21f6c664': 134,
    'b56c8f97': 135,
    'a17607f1': 136,
    'fefedf91': 137,
    '1abb69c0': 138,
    'ab9639e3': 139,
    'dedd3c55': 140,
    '6824f026': 141,
    'a9b95406': 142,
    'cb65312a': 143,
    'f93b2152': 144,
    'f7c0a962': 145,
    '41cf65f8': 146,
    'e1132c24': 147,
    '3297779a': 148,
    '8113592e': 149,
    'ab1753b6': 150,
    '54716687': 151,
    '91d7e6d4': 152,
    '39b7a09b': 153,
    '736fb2aa': 154,
    '9bd9b811': 155,
    'ae062549': 156,
    '91807904': 157,
    '3b82e533': 158,
    'f0d3ca34': 159,
    '5a83aadf': 160,
    'e8ed87d5': 161,
    '610fdbf8': 162,
    '1d91d31a': 163,
    '9fd0063b': 164,
    '2b41ecbb': 165,
    'ad545d9b': 166,
    'c1b08b43': 167,
    '0ef55f96': 168,
    'ec495e11': 169,
    'ee19046a': 170,
    '1d2e65b1': 171,
    '002fcdbe': 172,
    '2ce8e1ea': 173,
    '078b3e4f': 174,
    'c2e06e4e': 175,
    '3777e98a': 176, # NEW EVENTS: 8 July #
    'c5ba91a3': 177,
    '11aa607e': 178,
    'ae4196d8': 179,
    '47b7b80c': 180,
    '7ee80192': 181,
    '90d0c865': 182,
    'a68842b7': 183, 
    '20729459': 184,
    '5f4bf937': 185,
    '91b55028': 186,
    'b61048aa': 187,
    'd74211a1': 188,
    '13f00d9d': 189,
    '75f4ed60': 190,
    'a62f1cba': 191,
    'b2de2b5c': 192,
    '42bbc233': 193,
    'f02eb450': 194,
    'f05e4970': 195,
    '4a9e386b': 196,
    '949ad523': 197,
    'f82f18b2': 198,
    '6005678d': 199,
    'cce2b6da': 200,
    '6f47db75': 201,
    'ee8864a1': 202,
    'd1f87bb9': 203,
    '982c8fa7': 204,
    '91d56927': 205,
    'f855254a': 206,
    '91813df9': 207,
    'a705547b': 208,
    '205ac3d8': 209,
    '67964614': 210,
    'd1a80e9f': 211,
    '62c9130e': 212,
    'b360ed81': 213,
    '2eace79a': 214,
    'a9b990cc': 215,
    '905533b6': 216,
    '75ab7e5e': 217,
    '43f701e6': 218,
    '0af04a7d': 219,
    'f73d8953': 220,
    'ad4a4888': 221,
    '8f2992a5': 222,
    'a0889e1d': 223,
    'f3b7a6f5': 224,
    '2c776f18': 225,
    '59f44107': 226,
    '046c197e': 227,
    '7022759b': 228,
    'c3caa05a': 229,
    '945ead86': 230,
    'a032e834': 231,
    '65081022': 232,
    '02135630': 233,
    '3f6b224f': 234,
    'e791e802': 235,
    'df9da441': 236,
    '9b150b35': 237,
    '9eb3fcb9': 238,
    '47d00e04': 239,
    '00be190d': 240,
    '368ee8ac': 241,
    'dce93c9e': 242,
    'bd8c3580': 243,
    '3c691dcc': 244,
    'a26be941': 245,
    'caee67f6': 246,
    'caa1e357': 247,
    '7741fa2c': 248,
    '967f7580': 249,
    'b5b64810': 250,
    'ad2d1a60': 251,
    '7c99cc16': 252,
    '4ed9f215': 253,
    'd495fc76': 254,
    '0b6f2c66': 255,
    '8beec482': 256,
    'd20591d9': 257,
    '7a934f70': 258,
    '888da6d9': 259,
    '84cfda89': 260, #END
    '4eb03bb8': 261,
    'b97490fb': 262, 
    'b2b30d1e': 263,
    '5d2f3083': 264,
    '4693a738': 265,
}
'''
########################################### DICTIONARY FOR EVENT MAPPING TO INTEGERS ###########################################



########################################### CLASSES ###########################################

# LogCluster Class for each event Template, associated with the template #
'''
class Logcluster:
    def __init__(self, logTemplate="", logIDL=None):
        self.logTemplate = logTemplate
        if logIDL is None:
            logIDL = []
        self.logIDL = logIDL
'''
class LogTemplateObj:
    def __init__(self, logTemplate=""):
        self.logTemplate = logTemplate



# AndroidLogParser Class #
class AndroidLogParser:
    def __init__(
        self,
        log_format,
        indir="./",
        outdir="./result/",
        depth=4,
        st=0.4,
        maxChild=100,
        rex=[],
        keep_para=True,
    ):
        """
        Attributes
        ----------
            rex : regular expressions used in preprocessing (step1)
            path : the input path stores the input log file name
            depth : depth of all leaf nodes
            st : similarity threshold
            maxChild : max number of children of an internal node
            logName : the name of the input file containing raw log messages
            savePath : the output path stores the file containing structured logs
        """
        self.path = indir
        self.depth = depth - 2
        self.st = st
        self.maxChild = maxChild
        self.logName = None
        self.savePath = outdir
        self.df_log = None
        self.log_format = log_format
        self.rex = rex
        self.keep_para = keep_para


    # Creates the .csv file, containing the parsed Android Logs along with the EventTemplates, EventIDs(output_file = "AndroidLogs_structured.csv")
    def outputResult(self, logTemplateObjList, output_file):

        # Creates the user_AndroidLogs.txt_structured.csv
        #log_templates = [0] * self.df_log.shape[0]
        #log_templateids = [0] * self.df_log.shape[0]
        log_templates = []
        log_templateids = []
        df_events = []
        for logTemplateObject in logTemplateObjList:
            template_str = " ".join(logTemplateObject.logTemplate)
            #occurrence = len(logClust.logIDL)
            template_id = hashlib.md5(template_str.encode("utf-8")).hexdigest()[0:8]
            log_templates.append(template_str)
            log_templateids.append(template_id)
            '''
            for logID in logClust.logIDL:
                logID -= 1
                log_templates[logID] = template_str
                log_templateids[logID] = template_id
            '''
            df_events.append([template_id, template_str])
        
        self.df_log["EventId"] = log_templateids
        self.df_log["EventTemplate"] = log_templates
        if self.keep_para:
            self.df_log["ParameterList"] = self.df_log.apply(
                self.get_parameter_list, axis=1
            )
        self.df_log.to_csv(
            os.path.join(self.savePath, output_file), index=False
        )



    # Android Log Parser #
    def parseAndroidLogs(self, logName, output_file):
        start_time = datetime.now()
        self.logName = logName # The Log File from which we want to parse the data (logName = "AndroidLogs.txt") #
        logObjectClusterL = []

        self.load_data()

        count = 0
        for idx, line in self.df_log.iterrows():
            
            # Extract the LineId #
            #logID = line["LineId"]

            # Pre-process the raw Android Data and drain the most crucial information #
            AndroidLogWithoutDrainedInfo = self.preprocess(line["Content"]).strip().split()
            
            #newCluster = LogTemplateObj(logTemplate=AndroidLogWithoutDrainedInfo, logIDL=[logID])
            NewLogTemplateObj = LogTemplateObj(logTemplate=AndroidLogWithoutDrainedInfo)
            logObjectClusterL.append(NewLogTemplateObj)

            count += 1
            if count % 1000 == 0 or count == len(self.df_log):
                print(
                    "\033[91mProcessed {0:.1f}% of log lines.\033[0m".format(
                        count * 100.0 / len(self.df_log)
                    )
                )

        if not os.path.exists(self.savePath):
            os.makedirs(self.savePath)

        self.outputResult(logObjectClusterL, output_file) 
        print("\033[91mParsing done. [Time taken: {!s}]\033[0m".format(datetime.now() - start_time))

    # A function that loads log data from a file, parses it using a regular expression generated from the log format, and stores the structured data in a DataFrame #
    def load_data(self): 
        headers, regex = self.generate_logformat_regex(self.log_format)
        self.df_log = self.log_to_dataframe(
            os.path.join(self.path, self.logName), regex, headers, self.log_format
        )

    # This function preprocess the data and drains the info we want(like MAC addresses, based on the regular expressions) #
    def preprocess(self, line):
        for currentRex in self.rex:
            line = re.sub(currentRex, "<*>", line)
        return line

    # Function to transform log file to dataframe #
    def log_to_dataframe(self, log_file, regex, headers, logformat):
        
        log_messages = []
        linecount = 0
        with open(log_file, "r") as fin:
            for line in fin.readlines():
                try:
                    match = regex.search(line.strip())
                    message = [match.group(header) for header in headers]
                    log_messages.append(message)
                    linecount += 1
                except Exception as e:
                    pass
                    #print("[Warning] Skip line: " + line)
        logdf = pd.DataFrame(log_messages, columns=headers)
        logdf.insert(0, "LineId", None)
        logdf["LineId"] = [i + 1 for i in range(linecount)]
        print("\033[91mTotal lines:\033[0m", len(logdf))
        return logdf


    # Generates the log format that takes as paremeter #
    def generate_logformat_regex(self, logformat):
        """Function to generate regular expression to split log messages"""
        headers = []
        splitters = re.split(r"(<[^<>]+>)", logformat)
        regex = ""
        for k in range(len(splitters)):
            if k % 2 == 0:
                splitter = re.sub(" +", "\\\s+", splitters[k])
                regex += splitter
            else:
                header = splitters[k].strip("<").strip(">")
                regex += "(?P<%s>.*?)" % header
                headers.append(header)
        regex = re.compile("^" + regex + "$")
        return headers, regex
########################################### CLASSES ###########################################






############################################################### FUNCTIONS ###############################################################
# Parser Function  that utilizes the parser #
def parser(input_dir, output_dir, log_file, log_format, output_file):
    
    st = 0.2   # Similarity threshold
    depth = 6  # Depth of all leaf nodes

    parser = AndroidLogParser(log_format, indir=input_dir, outdir=output_dir, depth=depth, st=st, rex=AndroidLogsRegex, keep_para=False)
    parser.parseAndroidLogs(log_file, output_file)




# A function that extracts the Event Ids column #
# INPUT FILE: csv_file (AndroidLogs_structured.csv)
# OUTPUT FILE: output_file (EventIDs.txt)

# For the Pre-Training
def extract_event_ids_for_pre_train(csv_file, output_file, max_retries=10, retry_delay=2):
    
    # Read the CSV file
    retries = 0
    
    while retries < max_retries:
        try:
            # Extract the EventIDs
            df = pd.read_csv(csv_file)
            event_ids = df["EventId"].tolist()
            event_ids_time_occurence = df["Time"].tolist()
            break  # If successful, exit the loop
        except FileNotFoundError:
            print("Error: File not found.")
            return
        except KeyError:
            print("Error: 'EventId' column not found.")
            return
        except pd.errors.EmptyDataError:
            print("Warning: Empty data in CSV file. Retrying...")
            retries += 1
            time.sleep(retry_delay)  # Wait before retrying
    
    if retries == max_retries:
        print(f"Error: Reached maximum retries ({max_retries}). Unable to read data from CSV file.")
        return
    
    # Append the one-hot encoded data to the output file
    with open(output_file, "w") as f:
        for event_id in event_ids:
            f.write((str(event_id)) + ',')


# For the Fine-Tuning
def extract_event_ids_and_timestamps_for_fine_tune(csv_file, output_file, max_retries=10, retry_delay=2):
    # Function to extract the hour from a timestamp
    def extract_hour(timestamp):
        try:
            # Parse timestamp assuming the format HH:MM:SS.sss
            dt = pd.to_datetime(timestamp, format='%H:%M:%S.%f')
            return dt.hour
        except ValueError:
            print(f"Error: Invalid timestamp format: {timestamp}")
            return None

    # Function to convert hour to cyclical features
    def hour_to_cyclical(hour, max_hour=23):
        if hour is None:
            return None, None
        angle = 2 * np.pi * hour / (max_hour + 1)
        return np.sin(angle), np.cos(angle)

    # Read the CSV file
    retries = 0
    while retries < max_retries:
        try:
            # Extract the EventIDs and Time
            df = pd.read_csv(csv_file)
            event_ids = df["EventId"].tolist()
            time_stamps = df["Time"].tolist()
            break  # If successful, exit the loop
        except FileNotFoundError:
            print("Error: File not found.")
            return
        except KeyError:
            print("Error: Required column not found in the CSV.")
            return
        except pd.errors.EmptyDataError:
            print("Warning: Empty data in CSV file. Retrying...")
            retries += 1
            time.sleep(retry_delay)  # Wait before retrying

    if retries == max_retries:
        print(f"Error: Reached maximum retries ({max_retries}). Unable to read data from CSV file.")
        return
    
    # Open the output file to write data
    with open(output_file, "w") as f:
        for event_id, timestamp in zip(event_ids, time_stamps):
            # Extract hour from timestamp
            hour = extract_hour(timestamp)
            # Convert hour to cyclical features
            sin_hour, cos_hour = hour_to_cyclical(hour)
            
            if sin_hour is not None and cos_hour is not None:
                # Write event ID and time features to the file
                f.write(f"{event_id},{sin_hour},{cos_hour}\n")
    



# A function that forms the sequences, based on the windows_size 
# INPUT FILE: file_name(EventIDs.txt)
# OUTPUT: sliding windows

# For the Pre-Training
def create_sliding_windows_for_pre_train(file_name, window_size):
    """Creates sliding windows from the list of events read from a file."""
    windows = []
    with open(file_name, 'r') as file:
        events = file.read().strip().rstrip(',').split(',')
        for i in range(len(events) - window_size + 1):
            window = events[i:i + window_size]
            windows.append(window)
    return windows


# For the Fine Tuning
def create_sliding_windows_for_fine_tune(file_name, window_size):
    """Creates sliding windows from the list of event-hour pairs read from a file.
    
    Each sliding window will be in the format:
    ([event_sequence], [timestamps_sequence])
    where event_sequence is a list of event IDs,
    and timestamps_sequence is a list of tuples representing the cyclical hours.
    """
    windows = []
    
    with open(file_name, 'r') as file:
        # Read each line and split by comma
        lines = file.readlines()
        
        # Extract events and cyclical hours from lines
        events = []
        cyclical_hours = []
        
        for line in lines:
            event, sin_hour, cos_hour = line.strip().split(',')
            events.append(event)
            cyclical_hours.append((float(sin_hour), float(cos_hour)))  # Convert to tuple of floats
        
        # Ensure events and hours lists have the same length
        if len(events) != len(cyclical_hours):
            raise ValueError("The number of events and cyclical hours does not match.")
        
        # Create sliding windows
        for i in range(len(events) - window_size + 1):
            event_window = events[i:i + window_size]
            cyclical_hour_window = cyclical_hours[i:i + window_size]
            windows.append((event_window, cyclical_hour_window))
    
    return windows




# A function that takes the sequences(sliding windows) and appends them into the output_file
# INPUT: sequences
# OUTPUT: sliding windows in the output file

# For The Pre-Training
def append_sequences_to_file_for_pre_train(sequences, output_file):
    with open(output_file, 'w') as file:
        for sequence in sequences:
            #print(sequence)
            
            file.write(','.join((sequence)) + '\n')


# For The Fine-Tuning
def append_sequences_to_file_for_fine_tune(sliding_windows, output_file):
    with open(output_file, 'w') as file:
        for sequence, timestamps in sliding_windows:
            # Format the events and timestamps as required
            sequence_str = str(sequence)  # Convert the list of events to a string
            timestamps_str = str(timestamps)  # Convert the list of timestamps to a string
            
            # Create the formatted string for the sliding window
            formatted_window = f"({sequence_str}, {timestamps_str})"
            
            # Write the formatted sliding window to the file
            file.write(formatted_window + '\n')

############################################################### FUNCTIONS ###############################################################




############################################################### MAIN ###############################################################
if __name__ == "__main__":
    
    if len(sys.argv) >= 4:
        LoggedInUser = sys.argv[2] # The LoggedIn user is the 3rd argument
         # Get the mode (fine-tune or pre-train)
        mode = sys.argv[3]  # The 4th argument will be the mode
        input_dir  = os.path.expanduser(f'~/Desktop/auth-app-server_Dev/ANDROID LOGS/{LoggedInUser}')
        log_file = f'{input_dir}/AndroidLogs.txt'
        user_events_file = f'{input_dir}/EventIDs.txt'
        sequence_file = f'{input_dir}/Sequences.txt'
        log_structured_file = f'{input_dir}/AndroidLogs_structured.csv'

        # Process based on the mode
        if mode == "-preTrain":
            print(f"Running in pre-train mode for user {LoggedInUser}")
            # ANDROID LOG PARSING #                                                                 
            parser(input_dir, input_dir, log_file, log_format, log_structured_file)                         
            extract_event_ids_for_pre_train(log_structured_file, user_events_file)                        
            sliding_windows = create_sliding_windows_for_pre_train(user_events_file, window_size)
            append_sequences_to_file_for_pre_train(sliding_windows, sequence_file)
            # Add pre-training logic here
        elif mode == "-fineTune":
            print(f"Running in fine-tune mode for user {LoggedInUser}")
            # ANDROID LOG PARSING #                                                                 
            parser(input_dir, input_dir, log_file, log_format, log_structured_file)                         
            extract_event_ids_and_timestamps_for_fine_tune(log_structured_file, user_events_file)                        
            sliding_windows = create_sliding_windows_for_fine_tune(user_events_file, window_size)
            append_sequences_to_file_for_fine_tune(sliding_windows, sequence_file)
            # Add fine-tuning logic here
        else:
            print(f"Unknown mode: {mode}")
            exit(1)  # Exit with an error code if the mode is unknown

    else:
        print("Usage: script.py <empty> <LoggedInUser> <mode>")
        exit(1)
    
############################################################### MAIN ###############################################################

