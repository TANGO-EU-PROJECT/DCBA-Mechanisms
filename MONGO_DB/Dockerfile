# Use the official MongoDB base image
FROM mongo:latest

# Create custom mount point 
VOLUME ["/data/db/devices"]

# Expose the internal Mongo port specified in the .env gile
EXPOSE ${MONGO_INITDB_INTERNAL_PORT}
