/* Contains the logic for what happens when an endpoint is hit. */


const fs = require('fs').promises;
const { Mutex } = require('async-mutex');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { isUserExists, FindUserInDatabase, findUserIndex, addRegistrationRequest, BcryptedPassword, VerifyRegisterSignature, RetrieveUsersPassword, addUserToDatabase, convertToPem, removeRegistrationRequest, VerifyLoginSignature, getUserURI} = require('../../utils/functions'); // Import utility functions
const jwt = require('jsonwebtoken');
const usersFilePath = path.join(__dirname, '../../DATABASE/workers.txt'); // Path to users file
const JWT_SECRET_KEY = "G&5@dWvX9#jY^!kL6f3F+v4V2r2OaKp7zQ1e8bZ*H9uN!cR"; // Secret key for JWT
const LogInTokenStorageDict = {}; // In-memory storage for tokens
const requestQueue = [];
let processingQueue = false;
const mutex = new Mutex();         

// Function to capture Android logs
exports.LogCapture = async (req, res) => {
  requestQueue.push({ req, res });
  processQueue();
};

// Function to process the queued requests
const processQueue = async () => {
  const release = await mutex.acquire();
  try {
    if (processingQueue) return;

    processingQueue = true;

    while (requestQueue.length > 0) {
      const { req, res } = requestQueue.shift();
      try {
        await processRequest(req, res);
      } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    }
  } finally {
    processingQueue = false;
    release();
  }
};

// The processRequest function
const processRequest = async (req, res) => {
  const user = req.body.user;
  const logData = req.body.LogData;
  const JWT = req.body.JWT;

  // Check if the user JWT token is expired or not
  try {
    const decoded = jwt.verify(JWT, JWT_SECRET_KEY);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.log('Token is expired.');
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    } else {
      console.log('Invalid token.');
      return res.status(401).json({ message: 'Invalid token.' });
    }
  }

  // Check if logData is empty
  if (!logData) {
    return res.status(400).json({ message: 'Log data cannot be empty.' });
  }

  // The user directory to store their logs
  const userDir = path.join(__dirname, '../../DATABASE/ANDROID LOGS', user);
  const logFilePath = path.join(userDir, `LOGS.txt`);

  try {
    // Check if the user directory exists, if not create it
    try {
      await fs.access(userDir); // Check if the directory exists
    } catch (error) {
      await fs.mkdir(userDir, { recursive: true }); // Create the directory if it doesn't exist
    }

    // 1. Performing LOCALIZATION
    const logLines = logData.split('\n');
    // Process one line at a time
    for (const line of logLines) {
      if (line.trim() !== '') {
        if (line.includes("WifiNetworkSelectorN") || line.includes("BLeScannerN")) {
          // Execute localization script if needed
          /*
          exec(`python3 "${LocalizatorPath}" "${line}" "${user}"`, (error, stdout, stderr) => {
            if (error) {
              console.error(`Error executing ${LocalizatorPath} script: ${error.message}`);
              return res.status(500).json({ message: "Internal Server Error" });
            }
            console.log(stdout);
          });
          */
        } else {
          // Append the logs to the file synchronously
          await fs.appendFile(logFilePath, line.trim() + '\n');

          // 2. Perform Neural Network: Detecting Abnormalities in the Sequence of the Data
          /*
          exec(`python3 "${FeatureExtractorScriptPath}" "${line}" "${user}"`, (error, stdout, stderr) => {
            if (error) {
              console.error(`Error executing ${FeatureExtractorScriptPath} script: ${error.message}`);
              return res.status(500).json({ message: "Internal Server Error" });
            }
            console.log(stdout);
          });
          */
        }
      }
    }
    // Respond only after the file append is successful
    return res.status(200).json({ message: 'Logs captured successfully.' });
  } catch (error) {
    console.error('Error appending logs to file:', error);
    return res.status(500).json({ message: 'Error appending logs.' });
  }
};


// Function to read users from the file 
exports.getUsers = (req, res) => {
  try {
    // Read user data from the file and parse it
    const users = fs.readFileSync(usersFilePath, 'utf-8');
    res.json(JSON.parse(users));  // Respond with the parsed user data
  } catch (error) {
    res.status(500).json({ message: 'Error reading users data' });
  }
};

// Function to handle login request
exports.loginRequest = async (req, res) => {
  try {
    const UserToLogin_username = req.body.username;
    const UserToLogin_password = req.body.password;

    if (!await isUserExists(UserToLogin_username)) {
      return res.status(404).json({ // Not Found status
        DisplayMessage: 'The username does not correspond to an existing account',
        LoginChallengeToSign: {}, // Empty challenge
        username: UserToLogin_username
      });
    }

    const user = await FindUserInDatabase(UserToLogin_username); // Ensure you await this if it's async

    // Validate the password
    if (await bcrypt.compare(UserToLogin_password, user.credential.password)) {
      // Generate a FIDO credential challenge
      const LoginChallengeToSign = crypto.randomBytes(32).toString('base64');

      // Update the challenge for the user
      const userIndex = await findUserIndex(UserToLogin_username);
      const users = JSON.parse(await fs.readFile(usersFilePath, 'utf-8')); // Use async readFile

      users[userIndex].credential.challenge = LoginChallengeToSign;

      // Save the updated user data back to the file
      await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8'); // Await file write if async

      // Send the challenge and response back to the client
      return res.status(200).json({ // OK status
        DisplayMessage: 'Login Challenge to Sign.',
        LoginChallengeToSign: LoginChallengeToSign,
        username: UserToLogin_username
      });
    } else {
      return res.status(401).json({ // Unauthorized status
        DisplayMessage: 'Invalid Password',
        LoginChallengeToSign: {}, // Empty challenge
        username: UserToLogin_username
      });
    }
  } catch (error) {
    console.error('Error handling login:', error);
    return res.status(500).json({ // Internal Server Error status
      DisplayMessage: 'Login Failed',
      LoginChallengeToSign: {}, // Empty challenge
      username: req.body.username
    });
  }
};



// Function to handle registration request
exports.registerRequest = async (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;

    // Check if the user already exists
    const userExists = await isUserExists(username); // Make sure to await this
    if (userExists) {
      return res.status(409).json({ // Conflict status
        DisplayMessage: 'Username already exists',
        username: username,
        RegisterChallenge: {}
      });
    }

    // Generate a random register challenge
    const RegisterChallenge = crypto.randomBytes(32).toString('base64');

    // Store the registration request temporarily, hashing the password
    addRegistrationRequest(username, await BcryptedPassword(password));

    // Respond back to the client with the challenge
    return res.status(200).json({ // Return 200 OK status
      DisplayMessage: 'Sending a Register Challenge to Sign.',
      username: username,
      RegisterChallenge: RegisterChallenge
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ // Return 500 Internal Server Error
      DisplayMessage: 'Registration Failed (SERVER TEMPORARY DOWN)',
      username: req.body.username,
      RegisterChallenge: {}
    });
  }
};



// Function to handle logout
exports.logout = async (req, res) => {
  let username; // Declare username variable outside the try block for accessibility in catch

  try {
    const { token } = req.body;

    // Verify and decode the token to get the payload
    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    username = decoded.username; // Extract the username

    // Remove the token from storage (or database)
    if (LogInTokenStorageDict[token]) {
      delete LogInTokenStorageDict[token]; // Remove from in-memory storage
    }

    console.log('\n\x1b[33m[SERVER]\x1b[0m', `\x1b[36mUSER "${username}" logged out and their token revoked successfully. . .\x1b[0m\n`);

    // Respond to the client with a success message and 200 status
    return res.status(200).json({ message: `User ${username} logged out successfully` });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.log('\n\x1b[33m[SERVER]\x1b[0m', `\x1b[36mToken has expired, but user "${username}" logged out successfully. . .\x1b[0m\n`);
      return res.status(200).json({ message: `User ${username} logged out successfully` });
    }

    console.error('Error handling logout:', error);
    return res.status(500).json({ message: 'Error handling logout' });
  }
};



// Function to handle uploading signature for login
// Function to handle uploading signature for login
exports.uploadSignature = async (req, res) => {
  try {
    // 1. Receive the Client's Data
    const userToVerifyChallenge = req.body.username;
    const LoginSignedSignatureChallenge = req.body.LoginSignedChallenge;
    const ConnectedDevice = req.body.deviceName;

    // 3. Find the user in the Database, given the username
    const user = await FindUserInDatabase(userToVerifyChallenge);

    // - User not Found for some reason (this should never happen)
    if (!user) {
      return res.status(404).json({ DisplayMessage: 'User not found' }); // 404 Not Found
    }

    // - Check if the user has the 'credential' property
    if (!user.hasOwnProperty('credential')) {
      return res.status(400).json({ DisplayMessage: 'User does not have a credential' }); // 400 Bad Request
    }

    // - Check if the credential object has the 'challenge' and 'publicKey' properties
    if (!user.credential.hasOwnProperty('challenge') || !user.credential.hasOwnProperty('PublicKey')) {
      return res.status(400).json({ DisplayMessage: 'Credential is missing required properties' }); // 400 Bad Request
    }

    // 4. Verify the signature using the provided public key
    const { isValid: signatureIsValid, publicKey: userPublicKey } = await VerifyLoginSignature(user, LoginSignedSignatureChallenge);

    // 5. Check if signature is valid
    if (signatureIsValid) {
      // USER AUTHENTICATED - SIGNATURE VALID
      user.credential.ConnectedDevice = ConnectedDevice;
      console.log('\n\x1b[33m[SERVER]\x1b[0m', `\x1b[36mUSER "${user.credential.user}" logged in. . .\x1b[0m\n`);

      // 6. Generate a JWT token for logged-in session
      const LoggedInToken = jwt.sign(
        { username: user.credential.user, PublicKey: userPublicKey },  // Payload
        JWT_SECRET_KEY,  // Secret key
        { expiresIn: '10s' }  // Token expiration time
      );

      // Store the token associated with the user in the token dictionary
      LogInTokenStorageDict[LoggedInToken] = user.credential.user;
      return res.status(200).json({ DisplayMessage: 'Authentication successful', token: LoggedInToken }); // 200 OK
    } else {
      // USER NOT AUTHENTICATED - SIGNATURE INVALID
      return res.status(401).json({ DisplayMessage: 'Authentication failed' }); // 401 Unauthorized
    }
  } catch (error) {
    console.error('Error handling signature verification:', error);
    return res.status(500).json({ DisplayMessage: 'Error handling signature verification' }); // 500 Internal Server Error
  }
};




// Function to handle uploading credentials for registration
exports.uploadCredential = async (req, res) => {
  try {
    // 1. Extract the Data sent from the client
    const username = req.body.username;                                   // The username of the Client
    const publicKeyBase64 = req.body.publicKey;                           // The Public Key of the Client
    const RegisteredSignedChallenge = req.body.RegisteredSignedChallenge; // The RegisterChallenge signed by the client with his/her private key
    const RegisterChallenge = req.body.RegisterChallenge;                 // The original RegisterChallenge
    const ConnectedDevice = req.body.ConnectedDevice;                     // The Device Model/Name that user is using
    const URI = req.body.URI;                                             // The file location of the user

    // Verify the signature
    const IsSignatureValid = await VerifyRegisterSignature(publicKeyBase64, RegisteredSignedChallenge, RegisterChallenge);

    if (IsSignatureValid) {
      // Retrieve the user's password
      const password = await RetrieveUsersPassword(username);
      await addUserToDatabase(RegisterChallenge, username, convertToPem(publicKeyBase64), password, ConnectedDevice, URI);
      await removeRegistrationRequest(username);

      if (password == null) {
        // Registration failed due to missing password
        return res.status(400).json({ // Set status to 400 for bad request
          DisplayMessage: 'Registration Failed',
          username: username
        });
      } else {

       // Correctly point to the ANDROID LOGS directory from within the API directory
      const logsDirectory = path.join(__dirname, '../../DATABASE/ANDROID LOGS');

        const userDirectory = path.join(logsDirectory, username); // Full path to the user's directory

        try {
          // Create the user directory (and any necessary parent directories)
          await fs.mkdir(userDirectory, { recursive: true });
        } catch (err) {
          console.log(`Error creating directory for user ${username}: ${err.message}`);
          return res.status(500).json({ // Set status to 500 for server error
            DisplayMessage: "Registration Succeeded, but failed to create user's logs directory",
            username: username
          });
        }

        // Creating additional files in the user directory
        const additionalFileNames = [`LOGS.txt`];

        for (const fileName of additionalFileNames) {
          const filePath = path.join(userDirectory, fileName);
          try {
            await fs.writeFile(filePath, '', 'utf-8'); // Use fs.writeFile with await
          } catch (err) {
            console.log(`Error creating ${fileName}: ${err.message}`);
            return res.status(500).json({ // Set status to 500 for server error
              DisplayMessage: "Registration Succeeded, but failed to create user's logs files",
              username: username
            });
          }
        }

        console.log('\n\x1b[33m[SERVER]\x1b[0m', `\x1b[36mUSER "${username}" registered successfully. . .\x1b[0m\n`);
        return res.status(200).json({ // Set status to 200 for success
          DisplayMessage: 'Registration Succeeded',
          username: username
        });
      }
    } else {
      // Invalid signature - registration failed
      return res.status(400).json({ // Set status to 400 for bad request
        DisplayMessage: 'Registration Failed',
        username: username
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ // Set status to 500 for server error
      DisplayMessage: 'Error processing Data',
      username: req.body.username
    });
  }
};

exports.getServerStatus = (req, res) => {
  res.status(200).json({ status: 'UP' });
};


// Validate JWT token
exports.validateToken = async (req, res) => {
  try {
    // Retrieve the token from the client
    const token = req.query.token;

    // If token is not provided
    if (!token) {
      return res.status(400).json({ status: 'No token provided' });
    }

    // Verify the token
    jwt.verify(token, JWT_SECRET_KEY, async (err, decoded) => {
      if (err) {
        // Check if the error is related to token expiration
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ status: 'Token expired' });
        }
        return res.status(401).json({ status: 'Invalid token' });
      }

      // Token is valid
      // Extract user information
      const username = decoded.username;
      const device = decoded.device;

      try {
        // Await the result of getUserURI
        const URI = await getUserURI(username);

        if (!URI) {
          console.log("No URI Found");
          return res.status(400).json({ status: 'No URI found' });
        }
        
        // Return user information with 200 OK status
        return res.status(200).json({ // Explicitly setting the 200 status
          status: 'Valid',
          username: username,
          device: device,
          URI: URI.uriContent // Access the uriContent property
        });
      } catch (uriError) {
        console.error('Error retrieving URI:', uriError);
        res.status(500).json({ status: 'Error retrieving URI' });
      }
    });
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(500).json({ status: 'Error validating token' });
  }
};

