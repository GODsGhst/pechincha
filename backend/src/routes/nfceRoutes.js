const { Router } = require('express');
const nfceController = require('../controllers/nfceController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

router.post('/processar', authMiddleware, nfceController.processar);

module.exports = router;
