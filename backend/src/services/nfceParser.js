const cheerio = require('cheerio');

// Número em formato monetário/quantidade pt-BR -> Number.
// Lida com "R$ 1.234,56" (vírgula decimal) E "1.000" / "0.550" (ponto decimal,
// como a SEFAZ-MG usa nas quantidades). Por isso NÃO assume ponto = milhar
// quando não há vírgula.
function parseValorBR(texto) {
  if (texto === undefined || texto === null) return null;
  let s = String(texto).replace(/R\$/g, '').replace(/[^\d.,]/g, '').trim();
  if (s === '') return null;
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
  } else if (s.includes(',')) {
    s = s.replace(',', '.'); // 7,99 -> 7.99
  }
  // só pontos ("1.000") ou só dígitos ficam como estão (ponto = decimal)
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

// Mantido para compatibilidade: trata ponto como separador de milhar.
function parseNumeroBR(texto) {
  if (texto === undefined || texto === null) return null;
  const limpo = String(texto).replace(/[^\d.,-]/g, '');
  if (!limpo) return null;
  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isNaN(numero) ? null : numero;
}

function limpar(texto) {
  return (texto || '').replace(/\s+/g, ' ').trim();
}

// Converte data "01/06/2025 14:30:00" para Date
function parseDataBR(texto) {
  if (!texto) return null;
  const m = String(texto).match(/(\d{2})\/(\d{2})\/(\d{4})[\sT]*(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, dia, mes, ano, hora, min, seg] = m;
  return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(min), Number(seg || 0));
}

// Chave de acesso da NFC-e: 44 dígitos.
function extrairChaveAcesso(texto) {
  if (!texto) return null;
  const colado = String(texto).replace(/(?<=\d)\s+(?=\d)/g, '');
  const rotulo = colado.match(/Chave\s*de\s*acesso[:\s]*(\d{44})/i);
  if (rotulo) return rotulo[1];
  const generico = colado.match(/(?<!\d)\d{44}(?!\d)/);
  return generico ? generico[0] : null;
}

// Extrai a chave de acesso da URL do QR Code (primeiro segmento do parâmetro p=)
function chaveAcessoDaUrl(url) {
  if (!url) return null;
  const m = String(url).match(/[?&]p=([^|&]+)/i);
  if (!m) return null;
  const digitos = m[1].replace(/\D/g, '');
  return digitos.length >= 44 ? digitos.slice(0, 44) : null;
}

// --- Estabelecimento (emitente) ---
function extrairEstabelecimento($, textoPagina) {
  // Nome: SEFAZ-MG usa <thead b>; outros layouts usam .txtTopo / #u20
  const nome =
    limpar($('thead b').first().text()) ||
    limpar($('.txtTopo').first().text()) ||
    limpar($('#u20').first().text()) ||
    null;

  const cnpjMatch = textoPagina.match(/CNPJ[:\s]*([\d]{2}\.?[\d]{3}\.?[\d]{3}\/?[\d]{4}-?[\d]{2})/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^\d]/g, '') : null;

  // Endereço: SEFAZ-MG põe na 2ª célula da tabela do cabeçalho
  let endereco = null;
  const celulasCabecalho = $('table.table.text-center tbody td');
  if (celulasCabecalho.length >= 2) {
    endereco = limpar($(celulasCabecalho.get(1)).text());
  }
  if (!endereco) {
    $('.text').each((_i, el) => {
      const t = limpar($(el).text());
      if (!endereco && t && !/CNPJ/i.test(t)) endereco = t;
    });
  }

  return { nome, cnpj, endereco };
}

// --- Itens (SEFAZ-MG: #myTable com <h7> e 4 células) ---
function extrairItensMG($) {
  const itens = [];
  $('#myTable tr').each((_i, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 4) return;
    const nome = limpar($(tds.get(0)).find('h7').text());
    if (!nome) return;
    const quantidade = parseValorBR($(tds.get(1)).text()) || 1;
    const valorTotalItem = parseValorBR($(tds.get(3)).text());
    if (valorTotalItem === null) return;
    const valorUnitario = quantidade ? valorTotalItem / quantidade : valorTotalItem;
    itens.push({
      nome,
      quantidade,
      valor_unitario: Number(valorUnitario.toFixed(4)),
      valor_total: Number(valorTotalItem.toFixed(2))
    });
  });
  return itens;
}

// --- Itens (layout #tabResult / genérico) ---
function extrairItensTabela($) {
  const itens = [];
  const REGEX_PRECO = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const ROTULOS = /^(c[óo]d(igo)?|descri|qtde?|un|vl\.?|valor|total|item|produto|pre[çc]o)\b/i;

  function processar(linhas) {
    linhas.each((_i, tr) => {
      const linha = $(tr);
      const nome = (
        linha.find('.txtTit2').first().text().trim() ||
        linha.find('.txtTit').first().text().trim() ||
        linha.find('span').first().text().trim()
      );
      if (!nome || nome.length < 2 || ROTULOS.test(nome)) return;

      const qtdTexto = linha.find('.Rqtd').text();
      const unitTexto = linha.find('.RvlUnit').text();
      let totalTexto = linha.find('.valor').first().text();
      if (!parseNumeroBR(totalTexto)) {
        const precos = linha.text().match(REGEX_PRECO);
        if (precos && precos.length) totalTexto = precos[precos.length - 1];
      }

      const quantidade = parseNumeroBR(qtdTexto.replace(/Qtde\.?:?/i, '')) || 1;
      let valorUnitario = parseNumeroBR(unitTexto.replace(/Vl\.?\s*Unit\.?:?/i, ''));
      let valorTotalItem = parseNumeroBR(totalTexto);

      if (valorUnitario === null && valorTotalItem !== null) valorUnitario = valorTotalItem / quantidade;
      if (valorTotalItem === null && valorUnitario !== null) valorTotalItem = valorUnitario * quantidade;
      if (valorUnitario === null && valorTotalItem === null) return;

      itens.push({
        nome,
        quantidade,
        valor_unitario: Number(valorUnitario.toFixed(4)),
        valor_total: Number(valorTotalItem.toFixed(2))
      });
    });
  }

  processar($('#tabResult tr'));
  if (itens.length === 0) processar($('table tr'));
  return itens;
}

// A estrutura do HTML da NFC-e varia por estado e sistema emissor; tentamos
// o layout SEFAZ-MG (#myTable) primeiro e depois o genérico (#tabResult).
function parseNfceHtml(html) {
  const $ = cheerio.load(html);
  const textoPagina = limpar($('body').text());

  const estabelecimento = extrairEstabelecimento($, textoPagina);

  const emissaoMatch = textoPagina.match(/Emiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4}[\sT]*\d{2}:\d{2}(?::\d{2})?)/i);
  const dataCompra = parseDataBR(emissaoMatch ? emissaoMatch[1] : textoPagina);

  let itens = extrairItensMG($);
  if (itens.length === 0) itens = extrairItensTabela($);

  // Valor total: soma dos itens (mais confiável entre layouts); cai para
  // seletores/regex só quando não há itens.
  let valorTotal = null;
  if (itens.length > 0) {
    valorTotal = Number(itens.reduce((soma, i) => soma + i.valor_total, 0).toFixed(2));
  } else {
    const totalEl = $('.totalNumb.txtMax').first().text() || $('.txtMax').first().text();
    valorTotal = parseValorBR(totalEl);
    if (valorTotal === null) {
      const totalMatch = textoPagina.match(/Valor a pagar[^\d]*([\d.,]+)/i) ||
        textoPagina.match(/Valor total[^\d]*([\d.,]+)/i);
      valorTotal = totalMatch ? parseValorBR(totalMatch[1]) : null;
    }
  }

  return {
    estabelecimento,
    chave_acesso: extrairChaveAcesso(textoPagina),
    data_compra: dataCompra,
    valor_total: valorTotal,
    itens
  };
}

module.exports = { parseNfceHtml, parseNumeroBR, parseValorBR, parseDataBR, extrairChaveAcesso, chaveAcessoDaUrl };
