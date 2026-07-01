const SEGREDOS_FRACOS = new Set([
  'secret',
  'jwt_secret',
  'changeme',
  'segredo_de_teste',
  'demo_secret_dev',
  'persist_secret_dev'
]);

function boolEnv(valor) {
  return ['1', 'true', 'yes', 'sim'].includes(String(valor || '').trim().toLowerCase());
}

function segredoJwtValido(secret) {
  return typeof secret === 'string' &&
    secret.length >= 32 &&
    !SEGREDOS_FRACOS.has(secret.toLowerCase());
}

function listaCsv(valor) {
  return String(valor || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function urlHttpValida(valor, { exigirHttps = false } = {}) {
  try {
    const url = new URL(String(valor || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (exigirHttps && url.protocol !== 'https:') return false;
    return Boolean(url.hostname);
  } catch (_e) {
    return false;
  }
}

function portaValida(valor) {
  const porta = Number(valor || 587);
  return Number.isInteger(porta) && porta > 0 && porta <= 65535;
}

function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

    const origins = listaCsv(process.env.CORS_ORIGIN);
    if (origins.length === 0) {
      throw new Error('CORS_ORIGIN é obrigatório em produção');
    }
    if (origins.some((origin) => origin === '*' || !urlHttpValida(origin, { exigirHttps: true }))) {
      throw new Error('CORS_ORIGIN em produção deve conter apenas URLs HTTPS explícitas');
    }

    if (!urlHttpValida(process.env.PASSWORD_RESET_BASE_URL, { exigirHttps: true })) {
      throw new Error('PASSWORD_RESET_BASE_URL é obrigatório em produção e deve ser HTTPS');
    }

    const emailVerificationBaseUrl = process.env.EMAIL_VERIFICATION_BASE_URL || process.env.PASSWORD_RESET_BASE_URL;
    if (!urlHttpValida(emailVerificationBaseUrl, { exigirHttps: true })) {
      throw new Error('EMAIL_VERIFICATION_BASE_URL deve ser HTTPS em produção');
    }

    if (boolEnv(process.env.PASSWORD_RESET_EXPOSE_TOKEN)) {
      throw new Error('PASSWORD_RESET_EXPOSE_TOKEN não pode ser habilitado em produção');
    }
    if (boolEnv(process.env.EMAIL_VERIFICATION_EXPOSE_TOKEN)) {
      throw new Error('EMAIL_VERIFICATION_EXPOSE_TOKEN não pode ser habilitado em produção');
    }

    if (!smtpConfigurado()) {
      throw new Error('SMTP_HOST, SMTP_USER e SMTP_PASS são obrigatórios em produção para recuperação de senha');
    }

    if (!portaValida(process.env.SMTP_PORT)) {
      throw new Error('SMTP_PORT inválida');
    }
  } else if (!segredoJwtValido(process.env.JWT_SECRET)) {
    console.warn('JWT_SECRET de desenvolvimento é fraco. Use um valor forte antes de publicar.');
  }
}

module.exports = {
  validarAmbiente,
  segredoJwtValido,
  urlHttpValida,
  smtpConfigurado
};
