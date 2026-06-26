const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const Compra = require('../models/Compra');
const Estabelecimento = require('../models/Estabelecimento');
const { parseNfceHtml, chaveAcessoDaUrl } = require('../services/nfceParser');
const compraService = require('../services/compraService');
const { geocodificarEndereco } = require('../services/geoService');
const { lerQrCodeDeImagem, base64ParaBuffer } = require('../services/qrCodeService');

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function erroValidacaoUrl(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 422;
  return erro;
}

function ipPrivadoOuReservado(address) {
  const versao = net.isIP(address);
  if (!versao) return true;

  if (versao === 4) {
    const partes = address.split('.').map(Number);
    const [a, b] = partes;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const normalizado = address.toLowerCase();
  return (
    normalizado === '::' ||
    normalizado === '::1' ||
    normalizado.startsWith('fc') ||
    normalizado.startsWith('fd') ||
    normalizado.startsWith('fe80:') ||
    normalizado.startsWith('::ffff:127.') ||
    normalizado.startsWith('::ffff:10.') ||
    normalizado.startsWith('::ffff:192.168.')
  );
}

async function validarUrlPublica(urlRaw) {
  let url;
  try {
    url = new URL(String(urlRaw || ''));
  } catch (_err) {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal'
  ) {
    return null;
  }

  if (net.isIP(hostname)) {
    return ipPrivadoOuReservado(hostname) ? null : url.toString();
  }

  let enderecos;
  try {
    enderecos = await dns.lookup(hostname, { all: true });
  } catch (_err) {
    return null;
  }

  if (!enderecos.length || enderecos.some((entry) => ipPrivadoOuReservado(entry.address))) {
    return null;
  }

  return url.toString();
}

async function buscarHtmlDaNfce(url) {
  const urlValidada = await validarUrlPublica(url);
  if (!urlValidada) {
    throw erroValidacaoUrl('URL de NFC-e inválida');
  }

  let atual = urlValidada;
  for (let tentativa = 0; tentativa <= MAX_REDIRECTS; tentativa += 1) {
    const resposta = await axios.get(atual, {
      maxRedirects: 0,
      maxContentLength: MAX_HTML_BYTES,
      maxBodyLength: MAX_HTML_BYTES,
      validateStatus: (status) => status >= 200 && status < 400,
      responseType: 'text',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7'
      }
    });

    if (resposta.status >= 300 && resposta.status < 400 && resposta.headers.location) {
      const proxima = new URL(resposta.headers.location, atual).toString();
      const proximaValidada = await validarUrlPublica(proxima);
      if (!proximaValidada) throw erroValidacaoUrl('Redirecionamento de NFC-e inválido');
      atual = proximaValidada;
      continue;
    }

    const data = String(resposta.data || '');
    if (Buffer.byteLength(data, 'utf8') > MAX_HTML_BYTES) {
      throw new Error('HTML da NFC-e excede o limite');
    }
    return data;
  }

  throw new Error('Muitos redirecionamentos ao acessar NFC-e');
}

// POST /api/nfce/processar — body: { imagem_base64 } OU { url_origem } OU { html }
// Três formas de entrada:
//  1. imagem_base64: foto do cupom — o back-end decodifica o QR Code (jimp + qrcode-reader)
//  2. url_origem: URL já extraída do QR Code — o back-end busca o HTML
//  3. html: HTML da página da NFC-e já capturado
async function processar(req, res, next) {
  try {
    const { html, imagem_base64 } = req.body || {};
    let { url_origem } = req.body || {};

    if (!html && !url_origem && !imagem_base64) {
      return res.status(400).json({ error: 'Envie imagem_base64, url_origem ou html' });
    }

    // Foto do cupom: extrai a URL do QR Code
    if (!html && !url_origem && imagem_base64) {
      try {
        url_origem = await lerQrCodeDeImagem(base64ParaBuffer(imagem_base64));
      } catch (_err) {
        return res.status(422).json({ error: 'Não foi possível ler o QR Code da imagem' });
      }
      if (!/^https?:\/\//i.test(url_origem)) {
        return res.status(422).json({ error: 'O QR Code não contém uma URL válida de NFC-e' });
      }
    }

    let conteudoHtml = html;
    if (!conteudoHtml) {
      try {
        conteudoHtml = await buscarHtmlDaNfce(url_origem);
      } catch (err) {
        if (err.status === 422) {
          return res.status(422).json({ error: err.message });
        }
        return res.status(502).json({ error: 'Não foi possível acessar a URL da NFC-e' });
      }
    }
    if (Buffer.byteLength(String(conteudoHtml || ''), 'utf8') > MAX_HTML_BYTES) {
      return res.status(413).json({ error: 'HTML da NFC-e excede o limite permitido' });
    }

    let dados = parseNfceHtml(conteudoHtml);

    // Se o app mandou HTML ruim/intermediário, mas também mandou a URL, tenta
    // buscar a página real no backend antes de reportar falha de parsing.
    if ((!dados.itens || dados.itens.length === 0) && html && url_origem) {
      try {
        const htmlRefetch = await buscarHtmlDaNfce(url_origem);
        const dadosRefetch = parseNfceHtml(htmlRefetch);
        if (dadosRefetch.itens && dadosRefetch.itens.length > 0) {
          conteudoHtml = htmlRefetch;
          dados = dadosRefetch;
        }
      } catch (_err) {
        // Mantém o diagnóstico do HTML original abaixo.
      }
    }

    if (!dados.itens || dados.itens.length === 0) {
      // Diagnóstico: registra a estrutura recebida para ajustar o parser
      const titulo = (String(conteudoHtml).match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
      console.warn('[NFC-e][SEM ITENS] url=%s | tamanho=%d | titulo=%s | temTabResult=%s | qtdTabelas=%d',
        url_origem || '(html direto)',
        String(conteudoHtml).length,
        titulo.trim().slice(0, 80),
        /tabResult/i.test(conteudoHtml),
        (String(conteudoHtml).match(/<table/gi) || []).length);
      console.warn('[NFC-e][SEM ITENS] trecho:', String(conteudoHtml).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').slice(0, 800));
      return res.status(422).json({ error: 'Nenhum item encontrado no HTML da NFC-e' });
    }
    if (!dados.estabelecimento.nome && !dados.estabelecimento.cnpj) {
      return res.status(422).json({ error: 'Não foi possível identificar o estabelecimento na NFC-e' });
    }

    // Chave de acesso (44 dígitos): identificador único da NFC-e.
    // Tenta o HTML; se não achar, extrai da própria URL do QR Code.
    const chaveAcesso = dados.chave_acesso || chaveAcessoDaUrl(url_origem);

    // Deduplicação no nível do cupom: a mesma nota não pode ser importada
    // duas vezes (evita contar o mesmo preço em dobro no histórico).
    if (chaveAcesso) {
      const jaImportada = await Compra.findOne({ chave_acesso: chaveAcesso });
      if (jaImportada) {
        return res.status(409).json({
          error: 'Este cupom fiscal já foi importado',
          compra_id: jaImportada._id,
          chave_acesso: chaveAcesso
        });
      }
    }

    // Estabelecimento: busca por CNPJ; cria se não existir
    let estabelecimento = null;
    if (dados.estabelecimento.cnpj) {
      estabelecimento = await Estabelecimento.findOne({ cnpj: dados.estabelecimento.cnpj });
    }
    if (!estabelecimento) {
      // Geocodifica o endereço extraído do cupom para o estabelecimento aparecer no mapa
      const coords = await geocodificarEndereco(dados.estabelecimento.endereco);
      estabelecimento = await Estabelecimento.create({
        nome: dados.estabelecimento.nome || 'ESTABELECIMENTO NÃO IDENTIFICADO',
        cnpj: dados.estabelecimento.cnpj || `SEM-CNPJ-${Date.now()}`,
        endereco: dados.estabelecimento.endereco,
        localizacao: coords || undefined
      });
    }

    const dataCompra = dados.data_compra || new Date();

    // Deduplicação de produtos (busca por nome, cria se novo)
    let itensNovos = 0;
    const itensCompra = [];
    const precosParaRegistrar = [];

    for (const item of dados.itens) {
      const { produto, novo } = await compraService.encontrarOuCriarProduto(item.nome);
      if (novo) itensNovos += 1;

      itensCompra.push({
        produto_id: produto._id,
        nome_original: item.nome,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total
      });

      precosParaRegistrar.push({ produto, valor: item.valor_unitario });
    }

    const valorTotal = dados.valor_total !== null && dados.valor_total !== undefined
      ? dados.valor_total
      : Number(itensCompra.reduce((soma, i) => soma + i.valor_total, 0).toFixed(2));

    const compra = await Compra.create({
      usuario_id: req.usuario.id,
      estabelecimento_id: estabelecimento._id,
      data_compra: dataCompra,
      valor_total: valorTotal,
      nfce_url: url_origem,
      chave_acesso: chaveAcesso || undefined,
      itens: itensCompra
    });

    // Atualiza histórico de preços e menor/último preço de cada produto
    for (const { produto, valor } of precosParaRegistrar) {
      await compraService.registrarPreco({
        produto,
        estabelecimentoId: estabelecimento._id,
        compraId: compra._id,
        valor,
        data: dataCompra
      });
    }

    return res.status(201).json({
      compra_id: compra._id,
      estabelecimento: estabelecimento.nome,
      chave_acesso: chaveAcesso || null,
      data_compra: compra.data_compra,
      valor_total: compra.valor_total,
      itens_processados: itensCompra.length,
      itens_novos: itensNovos
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { processar };
