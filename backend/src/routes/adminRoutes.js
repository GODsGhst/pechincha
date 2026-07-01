const { Router } = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get('/resumo', adminController.resumo);
router.get('/auditoria', adminController.auditoria);
router.get('/usuarios', adminController.listarUsuarios);
router.put('/usuarios/:id/papel', adminController.atualizarPapelUsuario);
router.get('/precos', adminController.listarPrecos);
router.put('/precos/:id', adminController.atualizarPreco);
router.delete('/precos/:id', adminController.removerPreco);
router.post('/produtos/juntar', adminController.juntarProdutos);

module.exports = router;
