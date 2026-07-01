const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

function papelValido(papel) {
  return ['usuario', 'admin', 'superadmin'].includes(papel) ? papel : 'usuario';
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const partes = header.split(' ');
  const [esquema, token] = partes;

  if (partes.length !== 2 || esquema !== 'Bearer' || !token || token.length > 4096) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload || !payload.id || !mongoose.Types.ObjectId.isValid(payload.id)) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    req.usuario = {
      id: payload.id,
      papel: papelValido(payload.papel)
    };
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
