const { Router } = require('express');
const authController = require('../controllers/authController');
const rateLimit = require('../middleware/rateLimitMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();
const limitarCadastro = rateLimit({
  nome: 'auth:register',
  janelaMs: 15 * 60 * 1000,
  max: 6,
  mensagem: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.'
});
const limitarLogin = rateLimit({
  nome: 'auth:login',
  janelaMs: 15 * 60 * 1000,
  max: 12,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
});

router.post('/register', limitarCadastro, authController.register);
router.post('/login', limitarLogin, authController.login);
router.get('/me', authMiddleware, authController.me);
router.delete('/me', authMiddleware, authController.removerConta);

module.exports = router;
