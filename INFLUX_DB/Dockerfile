# Use the official InfluxDB base image
FROM influxdb:latest

# Declare the build-time argument (only just to create a new artifact in Harbor each time the mongo is re-built)
ARG BUILD_TIME
LABEL build_time="$BUILD_TIME"

# Volume for persistent data
VOLUME ["/var/lib/influxdb"]
