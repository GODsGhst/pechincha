const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const Compra = require('../models/Compra');
const Estabelecimento = require('../models/Estabelecimento');
const ImportacaoNfce = require('../models/ImportacaoNfce');
const { parseNfceHtml, chaveAcessoDaUrl } = require('../services/nfceParser');
const compraService = require('../services/compraService');
const { geocodificarEndereco } = require('../services/geoService');
const { lerQrCodeDeImagem, base64ParaBuffer } = require('../services/qrCodeService');
const displayFormatter = require('../services/displayFormatter');

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const IMPORTACAO_EXPIRADA_MS = 15 * 60 * 1000;

function erroValidacaoUrl(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 422;
  return erro;
}

function erroDuplicidadeMongo(err) {
  return err && (err.code === 11000 || err.code === 11001);
}

function mesmoId(a, b) {
  return a && b && String(a) === String(b);
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

function atualizarLocalizacaoEmSegundoPlano(estabelecimentoId, endereco) {
  if (!estabelecimentoId || !endereco) return;

  geocodificarEndereco(endereco)
    .then(async (coords) => {
      if (!coords) return;
      await Estabelecimento.updateOne(
        {
          _id: estabelecimentoId,
          $or: [
            { 'localizacao.lat': { $exists: false } },
            { 'localizacao.lat': null }
          ]
        },
        { $set: { localizacao: coords } }
      );
    })
    .catch(() => {
      // Geocodificação é enriquecimento secundário; não deve atrasar o scan.
    });
}

async function buscarCompraPorChave(chaveAcesso) {
  if (!chaveAcesso) return null;
  return Compra.findOne({ chave_acesso: chaveAcesso })
    .select('_id usuario_id chave_acesso criado_em recebido_em processado_em data_compra')
    .lean();
}

async function responderImportacaoExistente(res, {
  chaveAcesso,
  usuarioId,
  compraExistente = null,
  importacaoExistente = null
}) {
  const importacao = importacaoExistente || await ImportacaoNfce.findOne({ chave_acesso: chaveAcesso }).lean();
  const compra = compraExistente ||
    (importacao && importacao.compra_id
      ? await Compra.findById(importacao.compra_id)
        .select('_id usuario_id chave_acesso criado_em recebido_em processado_em data_compra')
        .lean()
      : await buscarCompraPorChave(chaveAcesso));

  const emProcessamento = importacao && importacao.status === 'processando' && !compra;
  const donoId = compra ? compra.usuario_id : importacao && importacao.usuario_id;
  const pertenceAoUsuario = mesmoId(donoId, usuarioId);

  return res.status(409).json({
    error: emProcessamento
      ? 'Este cupom fiscal já está sendo processado'
      : 'Este cupom fiscal já foi importado',
    status_importacao: emProcessamento ? 'processando' : 'concluida',
    compra_id: pertenceAoUsuario && compra ? compra._id : null,
    chave_acesso: chaveAcesso,
    pertence_ao_usuario: Boolean(pertenceAoUsuario),
    recebido_em: (importacao && importacao.recebido_em) ||
      (compra && (compra.recebido_em || compra.criado_em)) ||
      null,
    importado_em: compra
      ? (compra.processado_em || compra.recebido_em || compra.criado_em || compra.data_compra)
      : null
  });
}

async function reservarImportacaoNfce(chaveAcesso, usuarioId, recebidoEm) {
  try {
    const importacao = await ImportacaoNfce.create({
      chave_acesso: chaveAcesso,
      usuario_id: usuarioId,
      recebido_em: recebidoEm,
      status: 'processando'
    });
    return { reservada: true, importacao };
  } catch (err) {
    if (!erroDuplicidadeMongo(err)) throw err;

    const expiradaAntesDe = new Date(recebidoEm.getTime() - IMPORTACAO_EXPIRADA_MS);
    const importacaoRecuperada = await ImportacaoNfce.findOneAndUpdate(
      {
        chave_acesso: chaveAcesso,
        compra_id: null,
        $or: [
          { status: 'falhou' },
          { status: 'processando', recebido_em: { $lt: expiradaAntesDe } }
        ]
      },
      {
        $set: {
          usuario_id: usuarioId,
          recebido_em: recebidoEm,
          status: 'processando',
          compra_id: null,
          processado_em: null,
          tempo_processamento_ms: null,
          erro: null
        }
      },
      { new: true }
    );

    if (importacaoRecuperada) return { reservada: true, importacao: importacaoRecuperada };

    const importacao = await ImportacaoNfce.findOne({ chave_acesso: chaveAcesso }).lean();
    return { reservada: false, importacao };
  }
}

async function reservarOuResponderImportacao(res, chaveAcesso, usuarioId, recebidoEm) {
  if (!chaveAcesso) return { respondeu: false, importacao: null };

  const jaImportada = await buscarCompraPorChave(chaveAcesso);
  if (jaImportada) {
    await responderImportacaoExistente(res, {
      chaveAcesso,
      usuarioId,
      compraExistente: jaImportada
    });
    return { respondeu: true, importacao: null };
  }

  const reserva = await reservarImportacaoNfce(chaveAcesso, usuarioId, recebidoEm);
  if (!reserva.reservada) {
    await responderImportacaoExistente(res, {
      chaveAcesso,
      usuarioId,
      importacaoExistente: reserva.importacao
    });
    return { respondeu: true, importacao: null };
  }

  return { respondeu: false, importacao: reserva.importacao };
}

async function concluirImportacaoNfce(importacaoId, compraId, processadoEm, tempoMs) {
  if (!importacaoId) return;
  await ImportacaoNfce.updateOne(
    { _id: importacaoId },
    {
      $set: {
        status: 'concluida',
        compra_id: compraId,
        processado_em: processadoEm,
        tempo_processamento_ms: tempoMs,
        erro: null
      }
    }
  );
}

async function falharImportacaoNfce(importacaoId, err) {
  if (!importacaoId) return;
  await ImportacaoNfce.updateOne(
    { _id: importacaoId },
    {
      $set: {
        status: 'falhou',
        erro: String(err && err.message ? err.message : err).slice(0, 300)
      }
    }
  );
}

async function obterOuCriarEstabelecimento(dadosEstabelecimento) {
  let estabelecimento = null;
  const cnpj = dadosEstabelecimento.cnpj;

  if (cnpj) {
    estabelecimento = await Estabelecimento.findOne({ cnpj });
    if (estabelecimento) return estabelecimento;
  }

  try {
    estabelecimento = await Estabelecimento.create({
      nome: displayFormatter.formatarNomeEstabelecimento(dadosEstabelecimento.nome) || 'Estabelecimento não identificado',
      cnpj: cnpj || `SEM-CNPJ-${Date.now()}`,
      endereco: displayFormatter.formatarEndereco(dadosEstabelecimento.endereco)
    });
    atualizarLocalizacaoEmSegundoPlano(estabelecimento._id, dadosEstabelecimento.endereco);
    return estabelecimento;
  } catch (err) {
    if (erroDuplicidadeMongo(err) && cnpj) {
      estabelecimento = await Estabelecimento.findOne({ cnpj });
      if (estabelecimento) return estabelecimento;
    }
    throw err;
  }
}

// POST /api/nfce/processar — body: { imagem_base64 } OU { url_origem } OU { html }
// Três formas de entrada:
//  1. imagem_base64: foto do cupom — o back-end decodifica o QR Code (jimp + qrcode-reader)
//  2. url_origem: URL já extraída do QR Code — o back-end busca o HTML
//  3. html: HTML da página da NFC-e já capturado
async function processar(req, res, next) {
  const inicio = Date.now();
  const recebidoEm = new Date(inicio);
  let chaveAcesso = null;
  let reservaImportacao = null;
  let compra = null;

  try {
    async function responderFalha(status, mensagem) {
      if (reservaImportacao && reservaImportacao._id) {
        try {
          await falharImportacaoNfce(reservaImportacao._id, new Error(mensagem));
        } catch (_err) {
          // A resposta ao usuário é mais importante que o log de controle.
        }
      }
      return res.status(status).json({ error: mensagem });
    }

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

    chaveAcesso = chaveAcessoDaUrl(url_origem);
    if (chaveAcesso) {
      const reserva = await reservarOuResponderImportacao(res, chaveAcesso, req.usuario.id, recebidoEm);
      if (reserva.respondeu) return;
      reservaImportacao = reserva.importacao;
    }

    let conteudoHtml = html;
    if (!conteudoHtml) {
      try {
        conteudoHtml = await buscarHtmlDaNfce(url_origem);
      } catch (err) {
        if (err.status === 422) {
          return responderFalha(422, err.message);
        }
        return responderFalha(502, 'Não foi possível acessar a URL da NFC-e');
      }
    }
    if (Buffer.byteLength(String(conteudoHtml || ''), 'utf8') > MAX_HTML_BYTES) {
      return responderFalha(413, 'HTML da NFC-e excede o limite permitido');
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
      return responderFalha(422, 'Nenhum item encontrado no HTML da NFC-e');
    }
    if (!dados.estabelecimento.nome && !dados.estabelecimento.cnpj) {
      return responderFalha(422, 'Não foi possível identificar o estabelecimento na NFC-e');
    }

    // Chave de acesso (44 dígitos): identificador único da NFC-e.
    // Tenta o HTML; se não achar, extrai da própria URL do QR Code.
    const chaveDetectada = dados.chave_acesso || chaveAcessoDaUrl(url_origem);
    if (chaveAcesso && chaveDetectada && chaveDetectada !== chaveAcesso) {
      return responderFalha(422, 'A chave de acesso da NFC-e não confere com a URL lida');
    }
    chaveAcesso = chaveAcesso || chaveDetectada;

    // Deduplicação no nível do cupom: a mesma nota não pode ser importada
    // duas vezes (evita contar o mesmo preço em dobro no histórico).
    if (chaveAcesso && !reservaImportacao) {
      const reserva = await reservarOuResponderImportacao(res, chaveAcesso, req.usuario.id, recebidoEm);
      if (reserva.respondeu) return;
      reservaImportacao = reserva.importacao;
    }

    const estabelecimento = await obterOuCriarEstabelecimento(dados.estabelecimento);

    const dataCompra = dados.data_compra || new Date();

    // Deduplicação de produtos (busca por nome, cria se novo)
    let itensNovos = 0;
    const itensCompra = [];
    const precosParaRegistrar = [];
    const contextoProdutos = compraService.criarContextoProdutos();

    for (const item of dados.itens) {
      const { produto, novo } = await compraService.encontrarOuCriarProduto(item.nome, contextoProdutos);
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

    try {
      compra = await Compra.create({
        usuario_id: req.usuario.id,
        estabelecimento_id: estabelecimento._id,
        data_compra: dataCompra,
        valor_total: valorTotal,
        nfce_url: url_origem,
        chave_acesso: chaveAcesso || undefined,
        recebido_em: recebidoEm,
        itens: itensCompra
      });
    } catch (err) {
      if (erroDuplicidadeMongo(err) && chaveAcesso) {
        const compraExistente = await buscarCompraPorChave(chaveAcesso);
        if (compraExistente && reservaImportacao && reservaImportacao._id) {
          const agora = new Date();
          await concluirImportacaoNfce(reservaImportacao._id, compraExistente._id, agora, agora.getTime() - inicio);
        }
        return responderImportacaoExistente(res, {
          chaveAcesso,
          usuarioId: req.usuario.id,
          compraExistente
        });
      }
      throw err;
    }

    // Atualiza histórico de preços e menor/último preço de cada produto em lote.
    await compraService.registrarPrecosEmLote(precosParaRegistrar.map(({ produto, valor }) => ({
        produto,
        estabelecimentoId: estabelecimento._id,
        compraId: compra._id,
        valor,
        data: dataCompra
    })));

    const processadoEm = new Date();
    const tempoMs = processadoEm.getTime() - inicio;
    await Compra.updateOne(
      { _id: compra._id },
      {
        $set: {
          processado_em: processadoEm,
          tempo_processamento_ms: tempoMs
        }
      }
    );
    await concluirImportacaoNfce(reservaImportacao && reservaImportacao._id, compra._id, processadoEm, tempoMs);

    if (tempoMs > 8000) {
      console.warn('[NFC-e][LENTO] tempo=%dms itens=%d url=%s', tempoMs, itensCompra.length, url_origem || '(html direto)');
    }

    return res.status(201).json({
      compra_id: compra._id,
      estabelecimento: displayFormatter.formatarNomeEstabelecimento(estabelecimento.nome),
      chave_acesso: chaveAcesso || null,
      data_compra: compra.data_compra,
      valor_total: compra.valor_total,
      itens_processados: itensCompra.length,
      itens_novos: itensNovos,
      recebido_em: recebidoEm,
      processado_em: processadoEm,
      tempo_ms: tempoMs
    });
  } catch (err) {
    if (reservaImportacao && reservaImportacao._id) {
      try {
        if (compra && compra._id) {
          await concluirImportacaoNfce(reservaImportacao._id, compra._id, new Date(), Date.now() - inicio);
        } else {
          await falharImportacaoNfce(reservaImportacao._id, err);
        }
      } catch (_err) {
        // O erro original é mais importante para o diagnóstico.
      }
    }
    if (erroDuplicidadeMongo(err) && chaveAcesso) {
      return responderImportacaoExistente(res, {
        chaveAcesso,
        usuarioId: req.usuario.id
      });
    }
    return next(err);
  }
}

module.exports = { processar };
