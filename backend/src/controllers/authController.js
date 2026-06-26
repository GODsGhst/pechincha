const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const Compra = require('../models/Compra');
const ImportacaoNfce = require('../models/ImportacaoNfce');
const ListaCompra = require('../models/ListaCompra');
const compraService = require('../services/compraService');

const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 80;

function gerarToken(usuario) {
  return jwt.sign({ id: usuario._id, papel: usuario.papel || 'usuario' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function formatarUsuario(usuario) {
  return { id: usuario._id, nome: usuario.nome, email: usuario.email, papel: usuario.papel || 'usuario' };
}

async function register(req, res, next) {
  try {
    const { nome, email, senha } = req.body || {};
    const emailNormalizado = String(email || '').trim().toLowerCase();
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
    if (senhaTexto.length < MIN_PASSWORD_LENGTH || senhaTexto.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'A senha deve ter entre 8 e 128 caracteres' });
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
    const emailNormalizado = String(email || '').trim().toLowerCase();
    const senhaTexto = typeof senha === 'string' ? senha : '';

    if (!emailNormalizado || !senhaTexto) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
    }
    if (!EMAIL_REGEX.test(emailNormalizado) || emailNormalizado.length > 254) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado }).select('+senha');
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const senhaConfere = await bcrypt.compare(senhaTexto, usuario.senha);
    if (!senhaConfere) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    return res.json({ token: gerarToken(usuario), usuario: formatarUsuario(usuario) });
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

    if (usuario.papel === 'admin') {
      const outrosAdmins = await Usuario.countDocuments({
        _id: { $ne: usuario._id },
        papel: 'admin'
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

module.exports = { register, login, me, removerConta };
