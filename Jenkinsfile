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
        APP_NAME = "dcba-backend"                                           /* Application Name */
        ARTIFACTORY_SERVER = "harbor.tango.rid-intrasoft.eu"                /* Docker registry server URL */
        ARTIFACTORY_DOCKER_REGISTRY = "harbor.tango.rid-intrasoft.eu/dcba/" /* Docker image registry path */
        BRANCH_NAME = "stable"                                              /* Git branch to checkout */
        DOCKER_IMAGE_TAG = "$APP_NAME:R${env.BUILD_ID}"                     /* Docker image tag using the application name and Jenkins build ID */
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


        /* Stage 2: Build the Docker image for the application */
        stage('Build image') {
            steps {
                echo 'Starting to build docker image'
                script {
                    /* Build the Docker image and tag it with the repository path and the dynamically generated image tag */
                    def dockerImage = docker.build(ARTIFACTORY_DOCKER_REGISTRY + DOCKER_IMAGE_TAG) 
                    
                }
            }
        }

        /* Stage 3: Push the Docker image to the Docker registry */
        stage("Push_Image") {
            steps {
                /* Use Jenkins credentials to log in to the Docker registry */
                withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'harbor-jenkins-creds', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD']]) {
                    echo "***** Push Docker Image *****" 
                    sh 'docker login ${ARTIFACTORY_SERVER} -u ${USERNAME} -p ${PASSWORD}'                                                   /* Log in to the Docker registry */
                    sh 'docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${DOCKER_IMAGE_TAG}'                                                /* Push the Docker image with the current tag */
                    sh 'docker tag ${ARTIFACTORY_DOCKER_REGISTRY}${DOCKER_IMAGE_TAG} ${ARTIFACTORY_DOCKER_REGISTRY}${APP_NAME}:latest_dev'  /* Tag the pushed image as the latest development version */
                    sh 'docker image push ${ARTIFACTORY_DOCKER_REGISTRY}${APP_NAME}:latest_dev'                                             /* Push the latest development version tag to the registry */
                    
                }
            }
        }

        /* Stage 4: Remove Docker images locally to free up space */
        stage('Docker Remove Image locally') {
            steps {
                sh 'docker rmi "$ARTIFACTORY_DOCKER_REGISTRY$DOCKER_IMAGE_TAG"'    /* Remove the specific image by tag */
                sh 'docker rmi "$ARTIFACTORY_DOCKER_REGISTRY$APP_NAME:latest_dev"' /* Remove the latest development tag locally */
            }
        }

        /* Stage 5: Deploy the application to Kubernetes */
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
