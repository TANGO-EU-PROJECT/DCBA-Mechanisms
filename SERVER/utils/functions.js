/* Contains utility functions like reading and writing to files or other reusable helpers. */

const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const usersFilePath = path.join(__dirname, '../DATABASE/workers.txt');
const RegisterRequestsFilePath = path.join(__dirname, 'RegistrationRequest.txt');

// Helper function to read users from file
const readUsersFromFile = async () => {
  try {
    await fs.access(usersFilePath); // Check if the file exists
    const data = await fs.readFile(usersFilePath, 'utf8');

    // Check if the data is not empty before parsing
    if (!data) {
      console.warn('Users file is empty. Users do not exist.');
      return []; // Return an empty array
    }

    return JSON.parse(data); // Assuming the file content is JSON
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('Users file does not exist');
    } else if (err instanceof SyntaxError) {
      throw new Error('Invalid JSON format in users file');
    } else {
      throw new Error('Could not read users file');
    }
  }
};

//10. Hash the password with Bcrypt before storing it \\
async function BcryptedPassword(password) {
  return (await bcrypt.hash(password, 10));
}


// Helper function to check if the user exists
const isUserExists = async (username) => {
  const users = await readUsersFromFile();
  return users.some(user => user.credential.user === username);
};


// Helper function to find a user's index in the database
const findUserIndex = async (username) => {
  const users = await readUsersFromFile();
  return users.findIndex(user => user.credential.user === username);
};

// Helper function to get the URI of the user by username
const getUserURI = async (username) => {
  const user = await FindUserInDatabase(username);
  return user ? { uriContent: user.credential.URI } : null;
};

// Helper function to convert raw Base64 encoded public key to PEM format
const convertToPem = (publicKeyBase64) => {
  const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
  return `-----BEGIN PUBLIC KEY-----\n${publicKeyBuffer.toString('base64')}\n-----END PUBLIC KEY-----`;
};

// Helper function to compare two objects to check if they are equal
const areObjectsEqual = (obj1, obj2) => {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  return keys1.every(key => obj1[key] === obj2[key]);
};

// Helper function to create a credential and append the user to the database
const addUserToDatabase = async (challenge, username, PublicKey, password, ConnectedDevice, URI) => {
  try {
    const users = await readUsersFromFile();
    
    // Initialize credential as an empty object
    const credential = {}; 

    // Populate the credential object with the provided parameters
    credential.challenge = challenge;
    credential.user = username;
    credential.PublicKey = PublicKey;
    credential.password = password;
    credential.ConnectedDevice = ConnectedDevice;
    credential.URI = URI;

    const newUser = {
      type: "WORKER",
      credential: credential
    };

    users.push(newUser);
    await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error adding worker:', error);
  }
};


// Helper function to add a registration request
const addRegistrationRequest = async (username, password) => {
  const newRegistrationRequest = { username, password };
  
  let existingRequests = [];
  try {
    await fs.access(RegisterRequestsFilePath); // Check if the requests file exists
    const requestsFileContents = await fs.readFile(RegisterRequestsFilePath, 'utf8');
    
    // Check if the data is not empty before parsing
    if (requestsFileContents.trim().length > 0) {
      existingRequests = JSON.parse(requestsFileContents); // Parse existing requests
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading existing registration requests:', error);
    }
    // If the file does not exist, it is fine. We'll create it later.
  }
  
  existingRequests.push(newRegistrationRequest); // Add the new request

  // Save updated registration requests
  try {
    await fs.writeFile(RegisterRequestsFilePath, JSON.stringify(existingRequests, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving registration request:', err);
  }
};

// Helper function to retrieve a user's password from registration requests
const retrieveUsersPassword = async (username) => {
  let existingRequests = [];
  try {
    const requestsFileContents = await fs.readFile(RegisterRequestsFilePath, 'utf8');
    existingRequests = JSON.parse(requestsFileContents);
  } catch (error) {
    console.error('Error reading existing registration requests:', error);
  }

  const matchingRequest = existingRequests.find(request => request.username === username);
  return matchingRequest ? matchingRequest.password : null;
};

// Helper function to remove a registration request
const removeRegistrationRequest = async (usernameToRemove) => {
  try {
    const fileContents = await fs.readFile(RegisterRequestsFilePath, 'utf8');
    let existingRequests = JSON.parse(fileContents);

    existingRequests = existingRequests.filter(request => request.username !== usernameToRemove);
    await fs.writeFile(RegisterRequestsFilePath, JSON.stringify(existingRequests, null, 2), 'utf8');
  } catch (error) {
    console.error('Error removing registration request:', error);
  }
};

// Helper function to hash the password with Bcrypt
const bcryptPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Helper function to verify a login signature
const VerifyLoginSignature = async (user, loginSignedSignatureChallenge) => {
  const verify = crypto.createVerify('SHA256');
  verify.update(user.credential.challenge);
  const result = verify.verify(user.credential.PublicKey, loginSignedSignatureChallenge, 'base64');
  return { isValid: result, publicKey: user.credential.PublicKey };
};


// Helper function to find a user in the database
const FindUserInDatabase = async (userToLoginUsername) => {
  const users = await readUsersFromFile();
  return users.find(user => user.credential.user === userToLoginUsername);
};

async function VerifyRegisterSignature(publicKeyBase64, RegisterSignedSignatureChallenge, OriginalRegisterChallenge) {
  // Convert the received publicKey to PEM format
  const publicKeyPEM = convertToPem(publicKeyBase64);
  const verify = crypto.createVerify('SHA256');
  verify.update(OriginalRegisterChallenge);
  // Verify the signature using the provided public key in PEM format
  const result = verify.verify(publicKeyPEM, RegisterSignedSignatureChallenge, 'base64');
  return result;
}


// 8. Retrieves the temporarily saved password (corresponding to a given username) from the "RegistrationRequest.txt" file. 
async function RetrieveUsersPassword(username) {
  let existingRequests = [];
  try {
    const requestsFileContents = await fs.readFile(RegisterRequestsFilePath, 'utf8'); // Use await with fs.readFile
    existingRequests = JSON.parse(requestsFileContents);
  } catch (error) {
    // Handle error reading or parsing file
    console.error('Error reading existing registration requests:', error);
  }

  // Search for the matching username in the list of requests
  const matchingRequest = existingRequests.find(request => request.username === username);
  
  if (matchingRequest) {
    return matchingRequest.password;
  } else {
    return null;
  }
}





// Export the utility functions for use in other files
module.exports = {
  readUsersFromFile,
  isUserExists,
  FindUserInDatabase,
  findUserIndex,
  getUserURI,
  convertToPem,
  areObjectsEqual,
  addUserToDatabase,
  addRegistrationRequest,
  retrieveUsersPassword,
  removeRegistrationRequest,
  bcryptPassword,
  VerifyLoginSignature,
  VerifyRegisterSignature,
  findUserIndex,
  BcryptedPassword,
  RetrieveUsersPassword
};
