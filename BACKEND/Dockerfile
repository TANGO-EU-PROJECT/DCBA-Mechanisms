# Use the official Node.js image as the base image
FROM nikolaik/python-nodejs:python3.11-nodejs18	

# Set the working directory inside the container
WORKDIR /production

# Copy package.json and package-lock.json to install Node.js DEPENDENCIES
COPY ./package*.json ./
RUN npm install

# Install nodemon globally to run the server script
RUN npm install -g nodemon

# Copy the Python requirements and install them
COPY ./BACKEND/DEPENDENCIES/pip-requirements.txt ./DEPENDENCIES/
RUN pip3 install -r ./DEPENDENCIES/pip-requirements.txt

# Copy CA certificate to system-wide location
COPY ./BACKEND/ca.crt /usr/local/share/ca-certificates/ca.crt

# Update the CA certificates (for Debian-based systems)
RUN update-ca-certificates

# Copy the rest of the application code to the working directory
COPY . .

# Command to run the server with nodemon, ignoring the specified files and directories
WORKDIR /production

CMD [ "npm", "run", "prod" ]