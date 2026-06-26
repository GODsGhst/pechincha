const { Router } = require('express');
const listaController = require('../controllers/listaController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

router.use(authMiddleware);

router.get('/', listaController.listar);
router.post('/itens', listaController.adicionarItem);
router.put('/itens/:produtoId', listaController.atualizarItem);
router.delete('/itens/:produtoId', listaController.removerItem);
router.delete('/', listaController.limpar);

module.exports = router;
