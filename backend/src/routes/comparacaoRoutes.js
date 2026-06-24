const { Router } = require('express');
const comparacaoController = require('../controllers/comparacaoController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// Comparações são baseadas nas compras do próprio usuário — sempre autenticadas
router.use(authMiddleware);

router.get('/menores', comparacaoController.menoresDoUsuario);
router.post('/cesta', comparacaoController.compararCesta);
router.get('/compras/:id', comparacaoController.compararCompra);

module.exports = router;
