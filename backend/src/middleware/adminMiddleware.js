const Usuario = require('../models/Usuario');

async function adminMiddleware(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('papel');
    if (!usuario || usuario.papel !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = adminMiddleware;
