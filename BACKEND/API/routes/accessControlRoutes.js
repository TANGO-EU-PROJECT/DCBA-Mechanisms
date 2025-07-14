const express = require('express');
const router = express.Router();

const accessMap = {};  // In-memory permission map

// Utility: Check if a key exists
const keyToString = (id, role, action) => `${id}::${role}::${action}`;

// 1. Add permission
router.post('/add-permission', (req, res) => {
  try {
    const { id, role, action, resources } = req.body;
    if (!id || !role || !action || !Array.isArray(resources)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const key = keyToString(id, role, action);
    accessMap[key] = accessMap[key] || [];

    // Avoid duplicates
    resources.forEach(resource => {
      if (!accessMap[key].includes(resource)) {
        accessMap[key].push(resource);
      }
    });

    return res.status(201).json({ message: 'Permission added successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Get all permissions
router.get('/access-map', (req, res) => {
  return res.json(accessMap);
});

// 3. Remove specific permission
router.delete('/remove-permission', (req, res) => {
  try {
    const { id, role, action, resource } = req.body;
    if (!id || !role || !action || !resource) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const key = keyToString(id, role, action);
    if (!accessMap[key]) {
      return res.status(404).json({ error: 'Permission key not found' });
    }

    accessMap[key] = accessMap[key].filter(r => r !== resource);

    // Remove key if empty
    if (accessMap[key].length === 0) delete accessMap[key];

    return res.json({ message: 'Permission removed successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, accessMap };
