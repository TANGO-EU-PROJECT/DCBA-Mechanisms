const express = require('express');
const router = express.Router();
const path = require('path');
const controller = require('../controllers/controller');

// Serve login page
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../FRONTEND/login.html'));
});

// Handle login POST
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Simple static check (replace with real auth)
  if (username === 'RIAS-ADMIN' && password === 'RIAS-ADMIN') {
    req.session.loggedIn = true;
    res.redirect('/frontend/access-map');
  } else {
    res.redirect('/frontend/login?error=1');
  }
});

// Serve access map page only if logged in
router.get('/access-map', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, '../../../FRONTEND/access-map.html'));
  } else {
    res.redirect('/frontend/login');
  }
});

// Optional logout route
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.log(err);
    res.redirect('/frontend/login');
  });
});

/************************************************** POST REQUESTS **************************************************/
router.post('/device-access-map', controller.createOrUpdateDeviceAccessMap);

module.exports = router;
