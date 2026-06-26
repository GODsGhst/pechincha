const { Router } = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get('/resumo', adminController.resumo);
router.get('/usuarios', adminController.listarUsuarios);
router.put('/usuarios/:id/papel', adminController.atualizarPapelUsuario);

module.exports = router;
