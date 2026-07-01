const Usuario = require('../models/Usuario');

function ehAdmin(papel) {
  return papel === 'admin' || papel === 'superadmin';
}

async function adminMiddleware(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('papel');
    if (!usuario || !ehAdmin(usuario.papel)) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    req.admin = { id: usuario._id, papel: usuario.papel };
    return next();
  } catch (err) {
    return next(err);
  }
}

async function superAdminMiddleware(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('papel');
    if (!usuario || usuario.papel !== 'superadmin') {
      return res.status(403).json({ error: 'Acesso restrito a super administradores' });
    }

    req.admin = { id: usuario._id, papel: usuario.papel };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = adminMiddleware;
module.exports.superAdminMiddleware = superAdminMiddleware;
module.exports.ehAdmin = ehAdmin;
