const { Router } = require('express');
const authController = require('../controllers/authController');
const rateLimit = require('../middleware/rateLimitMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

function emailDaRequisicao(req) {
  return String((req.body || {}).email || '').trim().toLowerCase();
}

const limitarCadastro = rateLimit({
  nome: 'auth:register',
  janelaMs: 15 * 60 * 1000,
  max: 10,
  mensagem: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.'
});
const limitarLoginIp = rateLimit({
  nome: 'auth:login',
  janelaMs: 15 * 60 * 1000,
  max: 12,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
});
const limitarLoginConta = rateLimit({
  nome: 'auth:login:conta',
  janelaMs: 15 * 60 * 1000,
  max: 6,
  mensagem: 'Muitas tentativas para este e-mail. Aguarde alguns minutos e tente novamente.',
  keyGenerator: (req) => `auth:login:conta:${emailDaRequisicao(req) || req.ip || 'sem-email'}`
});
const limitarRecuperacao = rateLimit({
  nome: 'auth:forgot',
  janelaMs: 15 * 60 * 1000,
  max: 5,
  mensagem: 'Muitas solicitações de recuperação. Aguarde alguns minutos e tente novamente.'
});
const limitarRecuperacaoConta = rateLimit({
  nome: 'auth:forgot:conta',
  janelaMs: 60 * 60 * 1000,
  max: 3,
  mensagem: 'Muitas solicitações para este e-mail. Aguarde e tente novamente.',
  keyGenerator: (req) => `auth:forgot:conta:${emailDaRequisicao(req) || req.ip || 'sem-email'}`
});
const limitarResetSenha = rateLimit({
  nome: 'auth:reset',
  janelaMs: 15 * 60 * 1000,
  max: 8,
  mensagem: 'Muitas tentativas de redefinição. Aguarde alguns minutos e tente novamente.'
});
const limitarVerificacaoEmail = rateLimit({
  nome: 'auth:verify-email',
  janelaMs: 15 * 60 * 1000,
  max: 8,
  mensagem: 'Muitas tentativas de confirmação. Aguarde alguns minutos e tente novamente.'
});
const limitarReenvioVerificacao = rateLimit({
  nome: 'auth:resend-verification',
  janelaMs: 60 * 60 * 1000,
  max: 4,
  mensagem: 'Muitos reenvios de confirmação. Aguarde e tente novamente.'
});
const limitarReenvioVerificacaoConta = rateLimit({
  nome: 'auth:resend-verification:conta',
  janelaMs: 60 * 60 * 1000,
  max: 3,
  mensagem: 'Muitos reenvios para este e-mail. Aguarde e tente novamente.',
  keyGenerator: (req) => `auth:resend-verification:conta:${emailDaRequisicao(req) || req.ip || 'sem-email'}`
});
const limitar2fa = rateLimit({
  nome: 'auth:2fa',
  janelaMs: 15 * 60 * 1000,
  max: 10,
  mensagem: 'Muitas tentativas de código. Aguarde alguns minutos e tente novamente.'
});
const limitar2faConta = rateLimit({
  nome: 'auth:2fa:conta',
  janelaMs: 15 * 60 * 1000,
  max: 6,
  mensagem: 'Muitas tentativas para este e-mail. Aguarde alguns minutos e tente novamente.',
  keyGenerator: (req) => `auth:2fa:conta:${emailDaRequisicao(req) || req.ip || 'sem-email'}`
});

router.post('/register', limitarCadastro, authController.register);
router.post('/login', limitarLoginIp, limitarLoginConta, authController.login);
router.post('/verify-email', limitarVerificacaoEmail, authController.verifyEmail);
router.post('/resend-verification', limitarReenvioVerificacao, limitarReenvioVerificacaoConta, authController.resendVerification);
router.post('/verify-2fa', limitar2fa, limitar2faConta, authController.verifyAdmin2fa);
router.post('/forgot-password', limitarRecuperacao, limitarRecuperacaoConta, authController.forgotPassword);
router.post('/reset-password', limitarResetSenha, authController.resetPassword);
router.get('/legal', authController.legal);
router.get('/me', authMiddleware, authController.me);
router.get('/data-export', authMiddleware, authController.exportarDados);
router.delete('/me', authMiddleware, authController.removerConta);

module.exports = router;
