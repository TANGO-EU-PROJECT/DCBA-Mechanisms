# Use the official MongoDB base image
FROM mongo:latest

# Declare the build-time argument (only just to create a new artifact in Harbor each time the mongo is re-built)
ARG BUILD_TIME
LABEL build_time="$BUILD_TIME"

# Create a mount point (your existing config)
VOLUME ["/data/db/devices"]
