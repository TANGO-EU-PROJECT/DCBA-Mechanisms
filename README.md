# TANGO External Implementation

This repository contains the deployment code for the TANGO project, specifically tailored for INTRASOFT. 
**NOTE**: Please note that this repository will receive weekly updates related to the server code(!)


## Branches

- **development**: This branch is used for ongoing deployment work, where all new features and changes will be committed.
- **rias-tango-development**: This branch contains the finalized deployment code, which has been thoroughly tested and is ready for production use. **The Jenkins pipeline will automatically trigger deployments from this branch!**

## 📁 DCBA-Component Directory Structure

This repository contains all components required for the **TANGO DCBA** service, including backend logic and database infrastructure.

---

### BACKEND/

This directory contains the server-side code and all related resources essential for the DCBA TANGO backend implementation. It includes a `Dockerfile` responsible for building the image suitable for K8s deployment, along with the corresponding `.dockerignore` file.


#### Subdirectories:
- **`API/`**: Handles the API logic, including controllers for request handling, middleware for authentication and validation, and route definitions for all available endpoints.
- **`CONFIG/`**: This folder contains configuration settings for the server. The primary file loads environment variables from a `.env` file using the `dotenv` package. It exports the `ServerIPAddr` configuration, which determines the server's IP address based on the environment (`DEV` or `PROD`). If the environment is `DEV`, it uses the development hostname (`HOSTNAME_DEV`), otherwise, it uses the production hostname (`HOSTNAME_PROD`).
- **`DEPENDENCIES/`**: This folder contains files related to the project’s dependencies and environment setup.
- **`SCRIPTS/`**: Contains the localization scripts.
- **`UTILITIES/`**: Contains utility functions that are used by the controller to perform common tasks or operations across different parts of the application.

### INFLUX_DB/
This directory contains the Dockerfile for the Influx Database, which is used for K8s deployment. It stores the device logs.


### MONGO_DB/
This directory contains the Dockerfile for the MongoDB, used for K8s deployment. It stores information related to devices and employees' DIDs, as well as temporary data for QR scanner requests made by the devices. Two schema models are defined: one for devices and another for QR scanner requests.


---



## Jenkins Files

- **Jenkinsfile**: This file defines the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the `dcba-backend`, `dcba-mongo-db`, and `dcba-influx-db` applications. It is structured to execute various stages, including building, testing, pushing, and deploying the applications to a Kubernetes environment.
  
- **Jenkinsfile.kill**: This file defines a Jenkins pipeline specifically designed to delete a Kubernetes deployment.


## K8s Deployment Files

- **dcba-backend-deployment.yml**: This Kubernetes configuration file defines the Deployment and Service for the `dcba-backend`, `dcba-mongo-db`, and `dcba-influx-db` applications within the `tango-development` namespace. Each application runs in a separate pod. The ports for each service are:
  - `dcba-backend`: Internal port: 3000, External port: 3001
  - `dcba-mongo-db`: Internal port: 27017, External port: 27018
  - `dcba-influx-db`: Internal port: 8086, External port: 8087

- **dcba-server-ingress.yml**: This Kubernetes Ingress resource defines routing rules for external HTTP traffic (currently) to the `dcba-backend` application within the `tango-development` namespace. It utilizes the NGINX Ingress controller and includes TLS configuration with a Let's Encrypt certificate for secure access. The Ingress rules route traffic from the host `https://dcba-tango.riastone.eu/` to the `dcba-backend` service.

## Swagger

The Swagger documentation for the project is hosted at: [https://tango-eu-project.github.io/DCBA-Mechanisms/](https://tango-eu-project.github.io/DCBA-Mechanisms/) and is publicly accessible. The corresponding Swagger files are located in the `/docs` directory.
