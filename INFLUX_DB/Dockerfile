# Dockerfile.influx
FROM influxdb:latest

# Volume for persistent data
VOLUME ["/var/lib/influxdb"]

# Expose default InfluxDB port
EXPOSE ${INFLUXDB_INTERNAL_PORT}
