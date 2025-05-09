/*
 * Jenkins Pipeline for DCBA Backend, MongoDB, and InfluxDB Docker Images
 *
 * This pipeline automates the process of:
 * 1. Checking out the source code from a specified Git branch.
 * 2. Building the DCBA-Backend Docker image.
 * 3. Pulling and running MongoDB and InfluxDB containers.
 * 4. Pushing the built Docker images (Backend, MongoDB, InfluxDB) to the Docker registry.
 * 5. Removing Docker images locally to free up space after pushing.
 * 6. Deploying the DCBA backend application to a Kubernetes cluster.
 *
 * Key Environment Variables:
 * - ARTIFACTORY_SERVER: Docker registry server URL
 * - ARTIFACTORY_DOCKER_REGISTRY: Docker image registry path
 * - APP_NAME: Application name for Docker image tagging
 * - BRANCH_NAME: Git branch to checkout for the pipeline
 * - DOCKER_IMAGE_TAG: Tag for the Docker image using the Jenkins build ID
 * 
 * Stages Overview:
 * 1. Checkout: Checks out the source code from Git repository.
 * 2. Build DCBA-Backend Image: Builds the Backend Docker image.
 * 3. Build DCBA-MongoDB Image: Builds the MongoDB Docker image.
 * 4. Build DCBA-InfluxDB Image: Builds the InfluxDB Docker image.
 * 5. Push Images to Registry: Tags and pushes the images to the Docker registry.
 * 6. Docker Remove Images Locally: Removes locally stored Docker images to free up space.
 * 7. Deployment: Deploys the application to Kubernetes using kubectl.
 *
 * Post-Build Actions:
 * - Sends success or failure notifications to Slack.
 */


pipeline {
    /* Define the agent (node) where the pipeline should run */
    agent {
        node {
            /* Specify the label of the Jenkins agent that will execute the pipeline */
            label 'Agent01'
        }
    }
    

    /* Set up environment variables for the pipeline */
    environment {
        //BUILD_TAG = "stable-${env.BUILD_ID}"

        // Backend
        BACKEND_CONTAINER_NAME = "dcba-backend"                             /* Application Name */
        ARTIFACTORY_SERVER = "harbor.tango.rid-intrasoft.eu"                /* Docker registry server URL */
        ARTIFACTORY_DOCKER_REGISTRY = "harbor.tango.rid-intrasoft.eu/dcba/" /* Docker image registry path */
        BRANCH_NAME = "stable"                                              /* Git branch to checkout */
        BACKEND_DOCKER_IMAGE_TAG = "${BACKEND_CONTAINER_NAME}:R${env.BUILD_ID}" /* Docker image tag using the application name and Jenkins build ID */

        // MongoDB
        MONGO_IMAGE = "mongo:latest"
        MONGO_CONTAINER_NAME = "dcba-mongo-db"
        MONGO_INITDB_EXTERNAL_PORT = "27018"
        MONGO_INITDB_INTERNAL_PORT = "27017"
        MONGO_INITDB_ADMIN_USERNAME = "admin-username"
        MONGO_INITDB_ADMIN_PASSWORD = "admin-password"
        MONGO_INITDB_DATABASE = "dcba-mongo-db-v1"
        MONGO_DOCKER_IMAGE_TAG = "${MONGO_CONTAINER_NAME}:R${env.BUILD_ID}"
        // InfluxDB
        INFLUX_IMAGE = "influxdb:latest"
        INFLUX_CONTAINER_NAME = "dcba-influx-db"
        INFLUXDB_EXTERNAL_PORT = "8087"
        INFLUXDB_INTERNAL_PORT = "8086"
        INFLUX_INITDB_ADMIN_USERNAME = "admin-username"
        INFLUX_INITDB_ADMIN_PASSWORD = "admin-password"
        INFLUX_INITDB_ORG = "DCBA"
        INFLUX_INITDB_BUCKET = "DCBA"
        INFLUX_INITDB_AUTH_TOKEN = "QzaDsrfh8LkP0dnTmxj4fB4KAtQVZb-68BHqTTqWv2jie5daMLpEqeugbn1hIfbTcduNEuR8HAoUtVFjC2M3bw=="
        INFLUX_DOCKER_IMAGE_TAG = "${INFLUX_CONTAINER_NAME}:R${env.BUILD_ID}"
    }

    stages {
        /* Stage 1: Checkout the source code from the Git repository */
        stage('Checkout') {
            steps {
                echo 'Checkout SCM' /* Print a message to indicate the checkout process */
                checkout scm 
                checkout([$class: 'GitSCM', 
                          branches: [[name: env.BRANCH_NAME]],           /* Check out the specified branch */
                          extensions: [[$class: 'CleanBeforeCheckout']], /* Clean the workspace before checking out the code */
                          userRemoteConfigs: scm.userRemoteConfigs       /* Use the repository configuration from the pipeline SCM settings */
                ])
            }
        }


        /* Stage 2: Building the DCBA-Backend Image */
        stage('Build DCBA-Backend Image') {
            steps {
                echo 'Building Backend Docker Image'
                script {
                    /* Build Backend image */
                    def backendBuildTimestamp = new Date().format("yyyyMMddHHmmss")
                    def backendDockerImage = docker.build(ARTIFACTORY_DOCKER_REGISTRY + BACKEND_DOCKER_IMAGE_TAG, "--build-arg BUILD_TIME=${backendBuildTimestamp} -f BACKEND/Dockerfile .")
                }
            }
        }


        /* Stage 3: Build the DCBA-MongoDB Image */
        stage('Build DCBA-MongoDB Image') {
            steps {
                echo 'Building MongoDB Image'
                script {
                    def mongoBuildTimestamp = new Date().format("yyyyMMddHHmmss")
                    def mongoDockerImage = docker.build(ARTIFACTORY_DOCKER_REGISTRY + MONGO_DOCKER_IMAGE_TAG, "--build-arg BUILD_TIME=${mongoBuildTimestamp} -f MONGO_DB/Dockerfile .")
                }
            }
        }


        /* Stage 4: Build the DCBA-InfluxDB Image */
        stage('Build DCBA-InfluxDB Image') {
            steps {
                echo 'Building InfluxDB Image'
                script {
                    def influxBuildTimestamp = new Date().format("yyyyMMddHHmmss")
                    def influxDockerImage = docker.build(ARTIFACTORY_DOCKER_REGISTRY + INFLUX_DOCKER_IMAGE_TAG, "--build-arg BUILD_TIME=${influxBuildTimestamp} -f INFLUX_DB/Dockerfile .")
                }
            }
        }


        /* Stage 5: Push Images to Docker Registry */
        stage("Push Images to Registry") {
            steps {
                withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'harbor-jenkins-creds', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD']]) {
                    script {

                        echo "***** Docker Registry Login *****"
                        sh 'docker login ${ARTIFACTORY_SERVER} -u ${USERNAME} -p ${PASSWORD}'

                        echo "***** Tag and Push Backend Image *****"
                        sh """
                        docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${BACKEND_DOCKER_IMAGE_TAG}
                        docker tag ${ARTIFACTORY_DOCKER_REGISTRY}${BACKEND_DOCKER_IMAGE_TAG} ${ARTIFACTORY_DOCKER_REGISTRY}${BACKEND_CONTAINER_NAME}:latest-dev
                        docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${BACKEND_CONTAINER_NAME}:latest-dev
                        """

                        echo "***** Tag and Push MongoDB Image *****"
                        sh """
                        docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_DOCKER_IMAGE_TAG}
                        docker tag ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_DOCKER_IMAGE_TAG} ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_CONTAINER_NAME}:latest-dev
                        docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_CONTAINER_NAME}:latest-dev
                        """

                        echo "***** Tag and Push InfluxDB Image *****"
                        sh """
                        docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_DOCKER_IMAGE_TAG}
                        docker tag ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_DOCKER_IMAGE_TAG} ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_CONTAINER_NAME}:latest-dev
                        docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_CONTAINER_NAME}:latest-dev
                        """
                    }
                }
            }
        }


        /* Stage 6: Remove Docker images locally to free up space */
        stage('Docker Remove Images Locally') {
            steps {
                script {
                    echo "***** Removing Backend Images *****"
                    sh """
                    docker rmi ${ARTIFACTORY_DOCKER_REGISTRY}${BACKEND_DOCKER_IMAGE_TAG}
                    docker rmi ${ARTIFACTORY_DOCKER_REGISTRY}${BACKEND_CONTAINER_NAME}:latest-dev
                    """

                    echo "***** Removing MongoDB Image *****"
                    sh """
                    docker rmi ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_DOCKER_IMAGE_TAG}
                    docker rmi ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_CONTAINER_NAME}:latest-dev
                    """

                    echo "***** Removing InfluxDB Image *****"
                    sh """
                    docker rmi ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_DOCKER_IMAGE_TAG}
                    docker rmi ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_CONTAINER_NAME}:latest-dev
                    """
                }
            }
        }


        /* Stage 7: Deploy the application to Kubernetes */
        stage("Deployment") {
            steps {
                /* Use the kubeconfig file to interact with the Kubernetes cluster */
                withKubeConfig([credentialsId: 'K8s-config-file', serverUrl: 'https://167.235.66.115:6443', namespace: 'tango-development']) {
                    sh 'kubectl apply -f dcba-backend-deployment.yml' /* Apply the Kubernetes deployment manifest to update or deploy the application */
                    sh 'kubectl get pods'                            /* Verify that the deployment is running by listing the pods in the namespace  */
                }
            }
        }

    }

    /* Post-build actions: Notification of success or failure via Slack */
    post {
        /* If the build fails, send a red notification to Slack */
        failure {
            slackSend (color: "#FF0000", message: "Job FAILED: '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
        }
        /* If the build succeeds, send a green notification to Slack */
        success {
            slackSend (color: "#008000", message: "Job SUCCESSFUL: '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
        }
    }
}


