const express = require('express');
const { authenticateToken } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getProfile);

module.exports = router;
