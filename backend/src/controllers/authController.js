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
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('senha-invalida-para-equalizar-tempo', SALT_ROUNDS);
const RESET_GENERIC_MESSAGE = 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.';
const PASSWORD_POLICY_MESSAGE = 'A senha deve ter entre 8 e 128 caracteres, com letra maiúscula, letra minúscula e número';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario._id, papel: usuario.papel || 'usuario' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function formatarUsuario(usuario) {
  return { id: usuario._id, nome: usuario.nome, email: usuario.email, papel: usuario.papel || 'usuario' };
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
  return process.env.NODE_ENV !== 'production' || process.env.PASSWORD_RESET_EXPOSE_TOKEN === 'true';
}

function entregaResetDisponivel() {
  return emailService.smtpConfigurado() || resetDevHabilitado();
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

async function register(req, res, next) {
  try {
    const { nome, email, senha } = req.body || {};
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

    const jaExiste = await Usuario.findOne({ email: emailNormalizado });
    if (jaExiste) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senhaTexto, SALT_ROUNDS);
    const usuario = await Usuario.create({ nome: nomeLimpo, email: emailNormalizado, senha: senhaHash });

    return res.status(201).json({ token: gerarToken(usuario), usuario: formatarUsuario(usuario) });
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

module.exports = { register, login, forgotPassword, resetPassword, me, removerConta };
