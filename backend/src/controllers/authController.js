const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const Compra = require('../models/Compra');
const ImportacaoNfce = require('../models/ImportacaoNfce');
const ListaCompra = require('../models/ListaCompra');
const compraService = require('../services/compraService');
const emailService = require('../services/emailService');

const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 80;
const LOGIN_MAX_FALHAS = 5;
const LOGIN_BLOQUEIO_MS = 15 * 60 * 1000;
const RESET_TOKEN_BYTES = 32;
const RESET_EXPIRA_MS = 60 * 60 * 1000;
const EMAIL_VERIFY_TOKEN_BYTES = 32;
const EMAIL_VERIFY_EXPIRA_MS = 24 * 60 * 60 * 1000;
const ADMIN_2FA_EXPIRA_MS = 10 * 60 * 1000;
const ADMIN_2FA_MAX_TENTATIVAS = 5;
const TERMOS_VERSAO = '2026-07-01';
const POLITICA_PRIVACIDADE_VERSAO = '2026-07-01';
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('senha-invalida-para-equalizar-tempo', SALT_ROUNDS);
const RESET_GENERIC_MESSAGE = 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.';
const VERIFY_GENERIC_MESSAGE = 'Enviamos um código para confirmar seu e-mail.';
const PASSWORD_POLICY_MESSAGE = 'A senha deve ter entre 8 e 128 caracteres, com letra maiúscula, letra minúscula e número';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario._id, papel: usuario.papel || 'usuario' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function formatarUsuario(usuario) {
  return {
    id: usuario._id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel || 'usuario',
    email_verificado: usuario.email_verificado !== false,
    lgpd: usuario.lgpd
      ? {
          termos_versao: usuario.lgpd.termos_versao || null,
          politica_versao: usuario.lgpd.politica_versao || null,
          consentido_em: usuario.lgpd.consentido_em || null
        }
      : null
  };
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function senhaValida(senha) {
  return typeof senha === 'string' &&
    senha.length >= MIN_PASSWORD_LENGTH &&
    senha.length <= MAX_PASSWORD_LENGTH &&
    /[a-z]/.test(senha) &&
    /[A-Z]/.test(senha) &&
    /\d/.test(senha);
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function compararHexSeguro(a, b) {
  if (!a || !b) return false;
  const bufferA = Buffer.from(String(a), 'hex');
  const bufferB = Buffer.from(String(b), 'hex');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function resetDevHabilitado() {
  return process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_EXPOSE_TOKEN !== 'false';
}

function verificacaoEmailDevHabilitada() {
  return process.env.NODE_ENV !== 'production' && process.env.EMAIL_VERIFICATION_EXPOSE_TOKEN !== 'false';
}

function admin2faDevHabilitado() {
  return process.env.NODE_ENV !== 'production';
}

function entregaResetDisponivel() {
  return emailService.smtpConfigurado() || resetDevHabilitado();
}

function entregaVerificacaoEmailDisponivel() {
  return emailService.smtpConfigurado() || verificacaoEmailDevHabilitada();
}

function papelElevado(usuario) {
  return ['admin', 'superadmin'].includes(usuario && usuario.papel);
}

function montarResetUrl(email, token) {
  const base = String(process.env.PASSWORD_RESET_BASE_URL || '').trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set('email', email);
    url.searchParams.set('token', token);
    return url.toString();
  } catch (_e) {
    return null;
  }
}

function montarVerificacaoEmailUrl(email, token) {
  const base = String(process.env.EMAIL_VERIFICATION_BASE_URL || process.env.PASSWORD_RESET_BASE_URL || '').trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set('verify_email', email);
    url.searchParams.set('verify_token', token);
    return url.toString();
  } catch (_e) {
    return null;
  }
}

async function registrarInstrucaoReset(usuario, token) {
  const resetUrl = montarResetUrl(usuario.email, token);
  if (resetDevHabilitado()) {
    console.info(`[reset-senha] ${usuario.email} token=${token}${resetUrl ? ` url=${resetUrl}` : ''}`);
  }
  await emailService.enviarResetSenha({
    email: usuario.email,
    nome: usuario.nome,
    token,
    resetUrl
  });
}

async function iniciarVerificacaoEmail(usuario) {
  const token = crypto.randomBytes(EMAIL_VERIFY_TOKEN_BYTES).toString('hex');
  usuario.email_verificado = false;
  usuario.verificacao_email = {
    token_hash: hashResetToken(token),
    expira_em: new Date(Date.now() + EMAIL_VERIFY_EXPIRA_MS),
    solicitado_em: new Date()
  };
  await usuario.save();

  const verificacaoUrl = montarVerificacaoEmailUrl(usuario.email, token);
  if (verificacaoEmailDevHabilitada()) {
    console.info(`[verificacao-email] ${usuario.email} token=${token}${verificacaoUrl ? ` url=${verificacaoUrl}` : ''}`);
  }

  await emailService.enviarVerificacaoEmail({
    email: usuario.email,
    nome: usuario.nome,
    token,
    verificacaoUrl
  });

  return token;
}

function gerarCodigoAdmin2fa() {
  return String(crypto.randomInt(100000, 1000000));
}

async function iniciarAdmin2fa(usuario) {
  const codigo = gerarCodigoAdmin2fa();
  usuario.admin_2fa = {
    codigo_hash: hashResetToken(codigo),
    expira_em: new Date(Date.now() + ADMIN_2FA_EXPIRA_MS),
    solicitado_em: new Date(),
    tentativas: 0
  };
  await usuario.save();

  if (admin2faDevHabilitado()) {
    console.info(`[admin-2fa] ${usuario.email} codigo=${codigo}`);
  }

  await emailService.enviarCodigoAdmin2fa({
    email: usuario.email,
    nome: usuario.nome,
    codigo
  });

  return codigo;
}

function loginBloqueado(usuario) {
  const bloqueadoAte = usuario && usuario.login && usuario.login.bloqueado_ate;
  if (!bloqueadoAte) return false;
  return new Date(bloqueadoAte).getTime() > Date.now();
}

async function registrarFalhaLogin(usuario) {
  const agora = new Date();
  const tentativas = (Number(usuario.login && usuario.login.tentativas_falhas) || 0) + 1;
  const bloqueadoAte = tentativas >= LOGIN_MAX_FALHAS
    ? new Date(Date.now() + LOGIN_BLOQUEIO_MS)
    : null;

  usuario.login = {
    tentativas_falhas: tentativas,
    bloqueado_ate: bloqueadoAte,
    ultimo_falha_em: agora
  };
  await usuario.save();
  return bloqueadoAte;
}

async function limparFalhasLogin(usuario) {
  if (!usuario.login ||
    usuario.login.tentativas_falhas ||
    usuario.login.bloqueado_ate ||
    usuario.login.ultimo_falha_em) {
    usuario.login = {
      tentativas_falhas: 0,
      bloqueado_ate: null,
      ultimo_falha_em: null
    };
    await usuario.save();
  }
}

function tokenResetValido(usuario, token) {
  const reset = usuario && usuario.reset_senha;
  if (!reset || !reset.token_hash || !reset.expira_em) return false;
  if (new Date(reset.expira_em).getTime() <= Date.now()) return false;
  return compararHexSeguro(reset.token_hash, hashResetToken(token));
}

function tokenVerificacaoEmailValido(usuario, token) {
  const verificacao = usuario && usuario.verificacao_email;
  if (!verificacao || !verificacao.token_hash || !verificacao.expira_em) return false;
  if (new Date(verificacao.expira_em).getTime() <= Date.now()) return false;
  return compararHexSeguro(verificacao.token_hash, hashResetToken(token));
}

function admin2faValido(usuario, codigo) {
  const admin2fa = usuario && usuario.admin_2fa;
  if (!admin2fa || !admin2fa.codigo_hash || !admin2fa.expira_em) return false;
  if (Number(admin2fa.tentativas || 0) >= ADMIN_2FA_MAX_TENTATIVAS) return false;
  if (new Date(admin2fa.expira_em).getTime() <= Date.now()) return false;
  return compararHexSeguro(admin2fa.codigo_hash, hashResetToken(codigo));
}

async function register(req, res, next) {
  try {
    const { nome, email, senha, aceitar_termos, aceitar_privacidade } = req.body || {};
    const emailNormalizado = normalizarEmail(email);
    const nomeLimpo = String(nome || '').trim();
    const senhaTexto = typeof senha === 'string' ? senha : '';

    if (!nomeLimpo || !emailNormalizado || !senhaTexto) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha' });
    }
    if (nomeLimpo.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: 'Nome muito longo' });
    }
    if (!EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!senhaValida(senhaTexto)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }
    if (aceitar_termos !== true || aceitar_privacidade !== true) {
      return res.status(400).json({ error: 'É necessário aceitar os termos de uso e a política de privacidade' });
    }

    const jaExiste = await Usuario.findOne({ email: emailNormalizado });
    if (jaExiste) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senhaTexto, SALT_ROUNDS);
    const usuario = await Usuario.create({
      nome: nomeLimpo,
      email: emailNormalizado,
      senha: senhaHash,
      email_verificado: false,
      lgpd: {
        termos_versao: TERMOS_VERSAO,
        politica_versao: POLITICA_PRIVACIDADE_VERSAO,
        consentido_em: new Date(),
        ip_consentimento: req.ip || null,
        agente_consentimento: String(req.headers['user-agent'] || '').slice(0, 500) || null
      }
    });

    const payload = {
      requires_email_verification: true,
      message: VERIFY_GENERIC_MESSAGE,
      email: usuario.email,
      usuario: formatarUsuario(usuario)
    };

    if (entregaVerificacaoEmailDisponivel()) {
      const tokenVerificacao = await iniciarVerificacaoEmail(usuario);
      if (verificacaoEmailDevHabilitada()) payload.email_verification_token_dev = tokenVerificacao;
    } else {
      console.warn(`[verificacao-email] SMTP indisponível; token não gerado para ${usuario.email}`);
    }

    return res.status(201).json(payload);
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, senha } = req.body || {};
    const emailNormalizado = normalizarEmail(email);
    const senhaTexto = typeof senha === 'string' ? senha : '';

    if (!emailNormalizado || !senhaTexto) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
    }
    if (!EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado })
      .select('+senha +login.tentativas_falhas +login.bloqueado_ate +login.ultimo_falha_em');

    if (usuario && loginBloqueado(usuario)) {
      return res.status(429).json({ error: 'Muitas tentativas de senha. Aguarde alguns minutos e tente novamente.' });
    }

    const senhaConfere = await bcrypt.compare(senhaTexto, usuario ? usuario.senha : DUMMY_PASSWORD_HASH);
    if (!usuario || !senhaConfere) {
      if (usuario) {
        const bloqueadoAte = await registrarFalhaLogin(usuario);
        if (bloqueadoAte) {
          return res.status(429).json({ error: 'Muitas tentativas de senha. Aguarde alguns minutos e tente novamente.' });
        }
      }
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (usuario.email_verificado === false) {
      const payload = {
        requires_email_verification: true,
        message: 'Confirme seu e-mail antes de entrar.',
        email: usuario.email,
        usuario: formatarUsuario(usuario)
      };
      if (entregaVerificacaoEmailDisponivel()) {
        const tokenVerificacao = await iniciarVerificacaoEmail(usuario);
        if (verificacaoEmailDevHabilitada()) payload.email_verification_token_dev = tokenVerificacao;
      }
      return res.status(403).json(payload);
    }

    if (papelElevado(usuario)) {
      const codigo = await iniciarAdmin2fa(usuario);
      const payload = {
        requires_2fa: true,
        message: 'Enviamos um código para confirmar seu acesso administrativo.',
        email: usuario.email,
        usuario: formatarUsuario(usuario)
      };
      if (admin2faDevHabilitado()) payload.codigo_2fa_dev = codigo;
      return res.status(202).json(payload);
    }

    await limparFalhasLogin(usuario);
    return res.json({ token: gerarToken(usuario), usuario: formatarUsuario(usuario) });
  } catch (err) {
    return next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const { email, token } = req.body || {};
    const emailNormalizado = normalizarEmail(email);
    const tokenTexto = String(token || '').trim();

    if (!emailNormalizado || !EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!/^[a-f0-9]{64}$/i.test(tokenTexto)) {
      return res.status(400).json({ error: 'Código de confirmação inválido ou expirado' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado })
      .select('+verificacao_email.token_hash +verificacao_email.expira_em +verificacao_email.solicitado_em +login.tentativas_falhas +login.bloqueado_ate +login.ultimo_falha_em');

    if (!usuario || usuario.email_verificado === true || !tokenVerificacaoEmailValido(usuario, tokenTexto)) {
      return res.status(400).json({ error: 'Código de confirmação inválido ou expirado' });
    }

    usuario.email_verificado = true;
    usuario.verificacao_email = {
      token_hash: null,
      expira_em: null,
      solicitado_em: null
    };
    await usuario.save();
    await limparFalhasLogin(usuario);

    return res.json({ token: gerarToken(usuario), usuario: formatarUsuario(usuario) });
  } catch (err) {
    return next(err);
  }
}

async function resendVerification(req, res, next) {
  try {
    const emailNormalizado = normalizarEmail((req.body || {}).email);
    if (!emailNormalizado || !EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado })
      .select('+verificacao_email.token_hash +verificacao_email.expira_em +verificacao_email.solicitado_em');

    const payload = { message: VERIFY_GENERIC_MESSAGE };
    if (usuario && usuario.email_verificado === false && entregaVerificacaoEmailDisponivel()) {
      const tokenVerificacao = await iniciarVerificacaoEmail(usuario);
      if (verificacaoEmailDevHabilitada()) payload.email_verification_token_dev = tokenVerificacao;
    }

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function verifyAdmin2fa(req, res, next) {
  try {
    const { email, codigo } = req.body || {};
    const emailNormalizado = normalizarEmail(email);
    const codigoTexto = String(codigo || '').trim();

    if (!emailNormalizado || !EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!/^\d{6}$/.test(codigoTexto)) {
      return res.status(400).json({ error: 'Código administrativo inválido ou expirado' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado })
      .select('+admin_2fa.codigo_hash +admin_2fa.expira_em +admin_2fa.solicitado_em +admin_2fa.tentativas +login.tentativas_falhas +login.bloqueado_ate +login.ultimo_falha_em');

    if (!usuario || !papelElevado(usuario) || !admin2faValido(usuario, codigoTexto)) {
      if (usuario && papelElevado(usuario) && usuario.admin_2fa && usuario.admin_2fa.codigo_hash) {
        const tentativas = Number(usuario.admin_2fa.tentativas || 0) + 1;
        usuario.admin_2fa.tentativas = tentativas;
        if (tentativas >= ADMIN_2FA_MAX_TENTATIVAS) {
          usuario.admin_2fa = {
            codigo_hash: null,
            expira_em: null,
            solicitado_em: null,
            tentativas: 0
          };
        }
        await usuario.save();
      }
      return res.status(400).json({ error: 'Código administrativo inválido ou expirado' });
    }

    usuario.admin_2fa = {
      codigo_hash: null,
      expira_em: null,
      solicitado_em: null,
      tentativas: 0
    };
    await usuario.save();
    await limparFalhasLogin(usuario);

    return res.json({ token: gerarToken(usuario), usuario: formatarUsuario(usuario) });
  } catch (err) {
    return next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const emailNormalizado = normalizarEmail((req.body || {}).email);
    if (!emailNormalizado || !EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado })
      .select('+reset_senha.token_hash +reset_senha.expira_em +reset_senha.solicitado_em');

    const payload = { message: RESET_GENERIC_MESSAGE };
    if (usuario && entregaResetDisponivel()) {
      const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
      usuario.reset_senha = {
        token_hash: hashResetToken(token),
        expira_em: new Date(Date.now() + RESET_EXPIRA_MS),
        solicitado_em: new Date()
      };
      await usuario.save();
      await registrarInstrucaoReset(usuario, token);

      if (resetDevHabilitado()) {
        payload.reset_token_dev = token;
      }
    } else if (usuario) {
      console.warn(`[reset-senha] SMTP indisponível; token não gerado para ${usuario.email}`);
    }

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { email, token, senha } = req.body || {};
    const emailNormalizado = normalizarEmail(email);
    const tokenTexto = String(token || '').trim();
    const senhaTexto = typeof senha === 'string' ? senha : '';

    if (!emailNormalizado || !EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!/^[a-f0-9]{64}$/i.test(tokenTexto)) {
      return res.status(400).json({ error: 'Código de recuperação inválido ou expirado' });
    }
    if (!senhaValida(senhaTexto)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado })
      .select('+senha +reset_senha.token_hash +reset_senha.expira_em +reset_senha.solicitado_em +login.tentativas_falhas +login.bloqueado_ate +login.ultimo_falha_em');

    if (!usuario || !tokenResetValido(usuario, tokenTexto)) {
      return res.status(400).json({ error: 'Código de recuperação inválido ou expirado' });
    }

    usuario.senha = await bcrypt.hash(senhaTexto, SALT_ROUNDS);
    usuario.reset_senha = {
      token_hash: null,
      expira_em: null,
      solicitado_em: null
    };
    usuario.login = {
      tentativas_falhas: 0,
      bloqueado_ate: null,
      ultimo_falha_em: null
    };
    await usuario.save();

    return res.json({ message: 'Senha redefinida com sucesso. Entre com a nova senha.' });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({ usuario: formatarUsuario(usuario) });
  } catch (err) {
    return next(err);
  }
}

async function legal(req, res) {
  return res.json({
    termos_versao: TERMOS_VERSAO,
    politica_versao: POLITICA_PRIVACIDADE_VERSAO,
    termos_resumo: 'Use o Pechincha para registrar suas próprias notas e comparar preços colaborativamente.',
    privacidade_resumo: 'Tratamos dados de conta, notas fiscais lidas, lista de compras e histórico necessário para operar o serviço.'
  });
}

async function exportarDados(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.usuario.id)
      .select('nome email papel email_verificado criado_em lgpd');
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const [compras, importacoes, lista] = await Promise.all([
      Compra.find({ usuario_id: usuario._id }).lean(),
      ImportacaoNfce.find({ usuario_id: usuario._id }).lean(),
      ListaCompra.findOne({ usuario_id: usuario._id }).lean()
    ]);

    return res.json({
      exportado_em: new Date().toISOString(),
      usuario: formatarUsuario(usuario),
      dados: {
        compras,
        importacoes_nfce: importacoes,
        lista_compra: lista || null
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function removerConta(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('papel');
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (usuario.papel === 'superadmin') {
      const outrosSuperAdmins = await Usuario.countDocuments({
        _id: { $ne: usuario._id },
        papel: 'superadmin'
      });
      if (outrosSuperAdmins === 0) {
        return res.status(400).json({ error: 'Não é possível excluir o último super administrador' });
      }
    } else if (usuario.papel === 'admin') {
      const outrosAdmins = await Usuario.countDocuments({
        _id: { $ne: usuario._id },
        papel: { $in: ['admin', 'superadmin'] }
      });
      if (outrosAdmins === 0) {
        return res.status(400).json({ error: 'Não é possível excluir o último administrador' });
      }
    }

    const compras = await Compra.find({ usuario_id: usuario._id });
    for (const compra of compras) {
      await compraService.removerHistoricoDaCompra(compra);
    }

    await Promise.all([
      Compra.deleteMany({ usuario_id: usuario._id }),
      ImportacaoNfce.deleteMany({ usuario_id: usuario._id }),
      ListaCompra.deleteMany({ usuario_id: usuario._id }),
      Usuario.deleteOne({ _id: usuario._id })
    ]);

    return res.json({ message: 'Conta e dados pessoais removidos' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  verifyAdmin2fa,
  forgotPassword,
  resetPassword,
  me,
  legal,
  exportarDados,
  removerConta
};
