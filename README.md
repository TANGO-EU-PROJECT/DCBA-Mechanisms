# TANGO External Implementation

This repository contains the deployment code for the TANGO project, specifically tailored for INTRASOFT.

## Repository Structure

- **SERVER**: This directory contains the server code and all related resources essential for the TANGO implementation.
- **Configuration Files**: Additional configuration files related to the deployment process are also included.

## Branches

- **development**: This branch is used for ongoing deployment work, where all new features and changes will be committed.
- **stable**: This branch holds the finalized deployment code that has been thoroughly tested and is ready for production use.

## Installation and Setup

To set up the TANGO External Implementation on your local machine, follow these steps:

1. Clone the repository:
   ```bash
   git clone git@github.com:sterlan/DCBA_TANGO_EXTERNAL.git 
2. 
   Navigate to the DCBA_TANGO_EXTERNAL Directory:
   ```bash
   cd DCBA_TANGO_EXTERNAL
3. Build the Docker Image:
   ```bash
   docker built -t dcba_image .
4. Execute the Image Inside a Container:
   ```bash
   docker run -d -p 3000:3000 --name <specify-the-container-name> dcba_image:latest
5. Verify the Container is Up and Running:
   ```bash
   docker ps 
6. Access Container Logs:
   ```bash
   docker logs <container ID>

7. Stop the Container:
   ```bash
   docker stop <container ID>
8. Remove the Container:
   ```bash
   docker rm <container ID>

9. View the dcba_image:
   ```bash
   docker image ls