# TANGO External Implementation

This repository contains the deployment code for the TANGO project, specifically tailored for INTRASOFT. 
**NOTE**: Please note that this repository will receive weekly updates related to the server code(!)

## Repository Structure

- **SERVER**: This directory contains the server code and all related resources essential for the TANGO implementation.
- **Configuration Files**: Additional configuration files related to the deployment process are also included.

## Branches

- **development**: This branch is used for ongoing deployment work, where all new features and changes will be committed.
- **stable**: This branch contains the finalized deployment code, which has been thoroughly tested and is ready for production use. **The Jenkins pipeline will trigger deployments from this branch!**

## .ignore Files

- **.dockerignore**: The .dockerignore file is used to specify which files and directories should be excluded from the Docker image build process. 
- **.gitignore**: The .gitignore file defines which files and directories should be excluded from version control.

## Jenkins Files

- **Jenkinsfile**: The Jenkinsfile defines a continuous integration and continuous deployment(CI/CD) pipeline for the dcba_server_image application. It is structured to execute various stages required for building, testing, and deploying the application to a Kubernetes environment.
- **Jenkinsfile.kill**: The Jenkinsfile.kill defines a Jenkins pipeline, designed to delete a Kubernetes deployment.

## Docker Files

- **Dockerfile**: The Dockerfile sets up a container environment for a Node.js application with Python dependencies(/SERVER), using the official Nikolaik Python-Node.js image. The container exposes port 3000, allowing access to the Node.js application from outside the container.

## K8s Deployment Files

- **dcba-server-deployment.yml**: This Kubernetes configuration file defines a Deployment and a Service for the dcba-server application within the tango-development namespace. It exposes containerPort 3000, allowing external access to the application. The Service is externally accessible on port 80 and forwards traffic to containerPort 3000 of the pod.
- **dcba-server-ingress.yml**: This Kubernetes Ingress resource defines routing rules for external HTTP(currently) traffic to the dcba-server application within the tango-development namespace. It uses the nginx ingress controller and includes TLS configuration with a Let's Encrypt certificate for secure access. The Ingress rules route traffic from the host k8s-cluster.tango.rid-intrasoft.eu to the dcba-server service, specifically handling requests to the path /development/dcba-server. 

