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
        // Backend
        APP_NAME = "dcba-backend"                                           /* Application Name */
        ARTIFACTORY_SERVER = "harbor.tango.rid-intrasoft.eu"                /* Docker registry server URL */
        ARTIFACTORY_DOCKER_REGISTRY = "harbor.tango.rid-intrasoft.eu/dcba/" /* Docker image registry path */
        BRANCH_NAME = "stable"                                              /* Git branch to checkout */
        DOCKER_IMAGE_TAG = "$APP_NAME:R${env.BUILD_ID}"                     /* Docker image tag using the application name and Jenkins build ID */

        // MongoDB
        MONGO_IMAGE = "mongo:latest"
        MONGO_CONTAINER = "dcba-mongo-db"
        MONGO_INITDB_EXTERNAL_PORT = "27018"
        MONGO_INITDB_INTERNAL_PORT = "27017"
        MONGO_INITDB_ADMIN_USERNAME = "admin-username"
        MONGO_INITDB_ADMIN_PASSWORD = "admin-password"
        MONGO_INITDB_DATABASE = "dcba-mongo-db-v1"
        // InfluxDB
        INFLUX_IMAGE = "influxdb:latest"
        INFLUX_CONTAINER = "dcba-influx-db"
        INFLUXDB_EXTERNAL_PORT = "8087"
        INFLUXDB_INTERNAL_PORT = "8086"
        INFLUX_INITDB_ADMIN_USERNAME = "admin-username"
        INFLUX_INITDB_ADMIN_PASSWORD = "admin-password"
        INFLUX_INITDB_ORG = "DCBA"
        INFLUX_INITDB_BUCKET = "DCBA"
        INFLUX_INITDB_AUTH_TOKEN = "QzaDsrfh8LkP0dnTmxj4fB4KAtQVZb-68BHqTTqWv2jie5daMLpEqeugbn1hIfbTcduNEuR8HAoUtVFjC2M3bw=="
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
                    def dockerImage = docker.build(ARTIFACTORY_DOCKER_REGISTRY + DOCKER_IMAGE_TAG,'-f BACKEND/Dockerfile .')
                }
            }
        }


        /* Stage 3: Build the DCBA-MongoDB Image */
        stage('Build DCBA-MongoDB Image') {
            steps {
                script {
                    echo 'Pulling and Running MongoDB Container'
                    sh """
                    docker pull ${MONGO_IMAGE}
                    docker run -d \\
                    --name ${MONGO_CONTAINER} \\
                    -p ${MONGO_INITDB_EXTERNAL_PORT}:${MONGO_INITDB_INTERNAL_PORT} \\
                    -v mongo_data:/data/db/devices \\
                    -e MONGO_INITDB_ROOT_USERNAME=${MONGO_INITDB_ADMIN_USERNAME} \\
                    -e MONGO_INITDB_ROOT_PASSWORD=${MONGO_INITDB_ADMIN_PASSWORD} \\
                    -e MONGO_INITDB_DATABASE=${MONGO_INITDB_DATABASE} \\
                    ${MONGO_IMAGE}
                    """

                }
            }
        }


        /* Stage 4: Build the DCBA-InfluxDB Image */
        stage('Build DCBA-InfluxDB Image') {
            steps {
                script {
                    echo 'Pulling and Running InfluxDB Container'
                    sh """
                    docker pull ${INFLUX_IMAGE}
                    docker run -d \\
                    --name ${INFLUX_CONTAINER} \\
                    -p ${INFLUXDB_EXTERNAL_PORT}:${INFLUXDB_INTERNAL_PORT} \\
                    -v influx_data:/var/lib/influxdb \\
                    -e DOCKER_INFLUXDB_INIT_MODE=setup \\
                    -e DOCKER_INFLUXDB_INIT_USERNAME=${INFLUX_INITDB_ADMIN_USERNAME} \\
                    -e DOCKER_INFLUXDB_INIT_PASSWORD=${INFLUX_INITDB_ADMIN_PASSWORD} \\
                    -e DOCKER_INFLUXDB_INIT_ORG=${INFLUX_INITDB_ORG} \\
                    -e DOCKER_INFLUXDB_INIT_BUCKET=${INFLUX_INITDB_BUCKET} \\
                    -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN="${INFLUX_INITDB_AUTH_TOKEN}" \\
                    ${INFLUX_IMAGE}
                    """
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

                        echo "***** Tag abd Push Backend Image *****"
                        sh """
                        docker push ${ARTIFACTORY_DOCKER_REGISTRY}${DOCKER_IMAGE_TAG}
                        docker tag ${ARTIFACTORY_DOCKER_REGISTRY}${DOCKER_IMAGE_TAG} ${ARTIFACTORY_DOCKER_REGISTRY}${APP_NAME}:latest_dev
                        docker push ${ARTIFACTORY_DOCKER_REGISTRY}${APP_NAME}:latest_dev
                        """

                        echo "***** Tag and Push MongoDB Image *****"
                        sh """
                        docker tag ${MONGO_IMAGE} ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_CONTAINER}:${BUILD_TAG}
                        docker push ${ARTIFACTORY_DOCKER_REGISTRY}${MONGO_CONTAINER}:${BUILD_TAG}
                        """

                        echo "***** Tag and Push InfluxDB Image *****"
                        sh """
                        docker tag ${INFLUX_IMAGE} ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_CONTAINER}:${BUILD_TAG}
                        docker push ${ARTIFACTORY_DOCKER_REGISTRY}${INFLUX_CONTAINER}:${BUILD_TAG}
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
                    sh 'docker rmi "$ARTIFACTORY_DOCKER_REGISTRY$DOCKER_IMAGE_TAG" || true'
                    sh 'docker rmi "$ARTIFACTORY_DOCKER_REGISTRY$APP_NAME:latest_dev" || true'

                    echo "***** Removing MongoDB Image *****"
                    sh 'docker rmi "$ARTIFACTORY_DOCKER_REGISTRY$MONGO_CONTAINER:$BUILD_TAG" || true'

                    echo "***** Removing InfluxDB Image *****"
                    sh 'docker rmi "$ARTIFACTORY_DOCKER_REGISTRY$INFLUX_CONTAINER:$BUILD_TAG" || true'
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
