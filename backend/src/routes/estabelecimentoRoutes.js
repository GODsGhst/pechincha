const { Router } = require('express');
const estabelecimentoController = require('../controllers/estabelecimentoController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

router.get('/', estabelecimentoController.listar);
router.get('/mapa', estabelecimentoController.mapa); // antes de /:id para não ser tratado como ID
router.get('/:id/historico', estabelecimentoController.historico);
router.get('/:id', estabelecimentoController.detalhar);
router.post('/', authMiddleware, estabelecimentoController.criar);
router.put('/:id', authMiddleware, estabelecimentoController.atualizar);
router.delete('/:id', authMiddleware, estabelecimentoController.remover);

module.exports = router;
