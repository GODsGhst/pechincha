const { Router } = require('express');
const produtoController = require('../controllers/produtoController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = Router();

router.get('/', produtoController.listar);
router.get('/menores', produtoController.menores); // antes de /:id para não ser tratado como ID
router.get('/filtros', produtoController.filtros);
router.get('/sugestoes', produtoController.sugestoes);
router.get('/:id', produtoController.detalhar);
router.post('/', authMiddleware, adminMiddleware, produtoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, produtoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, produtoController.remover);

module.exports = router;
