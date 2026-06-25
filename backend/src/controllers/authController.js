const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const SALT_ROUNDS = 10;

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

    if (!nomeLimpo || !emailNormalizado || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    const jaExiste = await Usuario.findOne({ email: emailNormalizado });
    if (jaExiste) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
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

    if (!emailNormalizado || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
    }

    const usuario = await Usuario.findOne({ email: emailNormalizado }).select('+senha');
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const senhaConfere = await bcrypt.compare(senha, usuario.senha);
    if (!senhaConfere) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    return res.json({ token: gerarToken(usuario), usuario: formatarUsuario(usuario) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login };
