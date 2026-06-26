const SEGREDOS_FRACOS = new Set([
  'secret',
  'jwt_secret',
  'changeme',
  'segredo_de_teste',
  'demo_secret_dev',
  'persist_secret_dev'
]);

function segredoJwtValido(secret) {
  return typeof secret === 'string' &&
    secret.length >= 32 &&
    !SEGREDOS_FRACOS.has(secret.toLowerCase());
}

function validarAmbiente() {
  const emProducao = process.env.NODE_ENV === 'production';

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET é obrigatório');
  }

  if (emProducao) {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI é obrigatório em produção');
    }

    if (!segredoJwtValido(process.env.JWT_SECRET)) {
      throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres e não pode ser um valor padrão');
    }
  } else if (!segredoJwtValido(process.env.JWT_SECRET)) {
    console.warn('JWT_SECRET de desenvolvimento é fraco. Use um valor forte antes de publicar.');
  }
}

module.exports = { validarAmbiente, segredoJwtValido };
