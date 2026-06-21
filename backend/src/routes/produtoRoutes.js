const { Router } = require('express');
const produtoController = require('../controllers/produtoController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

router.get('/', produtoController.listar);
router.get('/menores', produtoController.menores); // antes de /:id para não ser tratado como ID
router.get('/:id', produtoController.detalhar);
router.post('/', authMiddleware, produtoController.criar);
router.put('/:id', authMiddleware, produtoController.atualizar);
router.delete('/:id', authMiddleware, produtoController.remover);

module.exports = router;
