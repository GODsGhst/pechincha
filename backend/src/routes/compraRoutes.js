const { Router } = require('express');
const compraController = require('../controllers/compraController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// Todas as rotas de compras exigem autenticação
router.use(authMiddleware);

router.get('/', compraController.listar);
router.get('/:id', compraController.detalhar);
router.post('/', compraController.criar);
router.put('/:id', compraController.atualizar);
router.delete('/:id', compraController.remover);

module.exports = router;
