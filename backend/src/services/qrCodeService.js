const { Jimp } = require('jimp');
const QrCode = require('qrcode-reader');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES * 1.4);
const MIMES_PERMITIDOS = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function tipoImagemPorAssinatura(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Decodifica um QR Code a partir de uma imagem (foto do cupom fiscal).
// Recebe um Buffer e retorna o texto do QR Code (a URL da NFC-e).
async function lerQrCodeDeImagem(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Imagem inválida ou muito grande');
  }
  if (!tipoImagemPorAssinatura(buffer)) {
    throw new Error('A imagem deve estar em PNG, JPEG ou WEBP');
  }

  const imagem = await Jimp.read(buffer);

  return new Promise((resolve, reject) => {
    const qr = new QrCode();
    qr.callback = (err, valor) => {
      if (err || !valor || !valor.result) {
        return reject(new Error('QR Code não encontrado na imagem'));
      }
      return resolve(valor.result);
    };
    qr.decode(imagem.bitmap);
  });
}

// Converte base64 (com ou sem prefixo data URI) em Buffer
function base64ParaBuffer(base64) {
  const texto = String(base64 || '').trim();
  const dataUri = texto.match(/^data:([^;]+);base64,(.*)$/is);
  const mime = dataUri ? String(dataUri[1]).toLowerCase() : null;
  const semPrefixo = dataUri ? dataUri[2] : texto;

  if (mime && !MIMES_PERMITIDOS.has(mime)) {
    throw new Error('A imagem deve estar em PNG, JPEG ou WEBP');
  }
  if (semPrefixo.length > MAX_BASE64_CHARS) {
    throw new Error('Imagem inválida ou muito grande');
  }
  if (!/^[a-zA-Z0-9+/=\s]+$/.test(semPrefixo)) {
    throw new Error('Imagem em base64 inválida');
  }
  const buffer = Buffer.from(semPrefixo, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !tipoImagemPorAssinatura(buffer)) {
    throw new Error('A imagem deve estar em PNG, JPEG ou WEBP');
  }
  return buffer;
}

module.exports = { lerQrCodeDeImagem, base64ParaBuffer };
