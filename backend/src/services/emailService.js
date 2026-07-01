const nodemailer = require('nodemailer');

let transporterCache = null;

function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  if (!smtpConfigurado()) return null;
  if (!transporterCache) {
    transporterCache = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporterCache;
}

function remetente() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@pechincha.local';
}

function escapeHtml(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function enviarEmail({ to, subject, text, html }) {
  const tx = transporter();
  if (!tx) {
    console.info(`[email] SMTP não configurado. E-mail para ${to}: ${subject}`);
    return { enviado: false, motivo: 'smtp_nao_configurado' };
  }

  await tx.sendMail({
    from: remetente(),
    to,
    subject,
    text,
    html
  });
  return { enviado: true };
}

async function enviarResetSenha({ email, nome, token, resetUrl }) {
  const destino = String(email || '').trim().toLowerCase();
  const assunto = 'Redefinição de senha do Pechincha';
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.';
  const saudacaoHtml = escapeHtml(saudacao);
  const resetUrlHtml = resetUrl ? escapeHtml(resetUrl) : null;
  const tokenHtml = escapeHtml(token);
  const texto = [
    saudacao,
    '',
    'Recebemos uma solicitação para redefinir sua senha.',
    resetUrl
      ? `Abra este link para criar uma nova senha: ${resetUrl}`
      : `Use este código de recuperação no app/site: ${token}`,
    '',
    'Esse código expira em 1 hora. Se você não pediu essa alteração, ignore este e-mail.'
  ].join('\n');

  const html = `
    <p>${saudacaoHtml}</p>
    <p>Recebemos uma solicitação para redefinir sua senha.</p>
    <p>${
      resetUrl
        ? `<a href="${resetUrlHtml}">Clique aqui para criar uma nova senha</a>.`
        : `Use este código de recuperação no app/site: <strong>${tokenHtml}</strong>`
    }</p>
    <p>Esse código expira em 1 hora. Se você não pediu essa alteração, ignore este e-mail.</p>
  `;

  return enviarEmail({ to: destino, subject: assunto, text: texto, html });
}

async function enviarCodigoAdmin2fa({ email, nome, codigo }) {
  const destino = String(email || '').trim().toLowerCase();
  const assunto = 'Código de acesso administrativo do Pechincha';
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.';
  const saudacaoHtml = escapeHtml(saudacao);
  const codigoLimpo = String(codigo || '').trim();
  const codigoHtml = escapeHtml(codigoLimpo);
  const texto = [
    saudacao,
    '',
    'Use este código para concluir seu acesso administrativo:',
    codigoLimpo,
    '',
    'Esse código expira em 10 minutos. Se você não tentou entrar, troque sua senha.'
  ].join('\n');

  const html = `
    <p>${saudacaoHtml}</p>
    <p>Use este código para concluir seu acesso administrativo:</p>
    <p><strong style="font-size:24px;letter-spacing:4px">${codigoHtml}</strong></p>
    <p>Esse código expira em 10 minutos. Se você não tentou entrar, troque sua senha.</p>
  `;

  return enviarEmail({ to: destino, subject: assunto, text: texto, html });
}

module.exports = { enviarEmail, enviarResetSenha, enviarCodigoAdmin2fa, smtpConfigurado };
