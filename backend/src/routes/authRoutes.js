const { Router } = require('express');
const authController = require('../controllers/authController');
const rateLimit = require('../middleware/rateLimitMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();
const limitarAuth = rateLimit({ janelaMs: 15 * 60 * 1000, max: 20 });

router.post('/register', limitarAuth, authController.register);
router.post('/login', limitarAuth, authController.login);
router.delete('/me', authMiddleware, authController.removerConta);

module.exports = router;
