const Jimp = require('jimp');
const QrCode = require('qrcode-reader');

// Decodifica um QR Code a partir de uma imagem (foto do cupom fiscal).
// Recebe um Buffer e retorna o texto do QR Code (a URL da NFC-e).
async function lerQrCodeDeImagem(buffer) {
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
  const semPrefixo = String(base64).replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  return Buffer.from(semPrefixo, 'base64');
}

module.exports = { lerQrCodeDeImagem, base64ParaBuffer };
