# Use the official Node.js image as the base image
FROM nikolaik/python-nodejs:python3.11-nodejs18	

# Set the working directory inside the container
WORKDIR /deployment

# Copy package.json and package-lock.json to install Node.js dependencies
COPY /SERVER/package*.json ./
RUN npm install

# Install nodemon globally to run the server script
RUN npm install -g nodemon


# Copy the Python requirements and install them
COPY ./SERVER/Dependencies/pip-requirements.txt ./Dependencies/
RUN pip3 install -r ./Dependencies/pip-requirements.txt

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port that your Node.js app will run on
EXPOSE 3000

# Command to run the server with nodemon, ignoring the specified files and directories
WORKDIR /deployment/SERVER

CMD [ "npm", "run", "dev" ]
