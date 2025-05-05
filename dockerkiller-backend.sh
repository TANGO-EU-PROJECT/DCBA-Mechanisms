#!/bin/bash

# Stop the containers
docker stop dcba-backend
docker stop dcba-mongo-db
docker stop dcba-influx-db

# Remove the containers
docker rm dcba-backend
docker rm dcba-mongo-db
docker rm dcba-influx-db

docker-compose down -v

# Remove all Docker volumes (including shared ones)
docker volume prune -f

# Remove untagged (dangling) Docker images
docker image prune -f

# Remove the cache builds
docker system prune



