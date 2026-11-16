const express = require('express');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { createLoginRateLimiter } = require('../middlewares/loginRateLimit');
const authController = require('../controllers/authController');

const router = express.Router();
const loginRateLimiter = createLoginRateLimiter();

router.post('/register', authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.get('/me', authenticateToken, authController.getProfile);

module.exports = router;
