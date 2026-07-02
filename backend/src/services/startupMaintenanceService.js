const mongoose = require('mongoose');
const { organizarProdutos } = require('./productMaintenanceService');

const MANUTENCAO_PRODUTOS_VERSAO = 'product-normalizer-2026-07-01-v3';
const LOCK_EXPIRADO_MS = 15 * 60 * 1000;

function manutencaoInicialHabilitada() {
  return ['1', 'true', 'yes', 'sim'].includes(
    String(process.env.RUN_PRODUCT_MAINTENANCE_ON_STARTUP || '').trim().toLowerCase()
  );
}

async function tentarReservarExecucao(collection, agora) {
  const expiradoAntesDe = new Date(agora.getTime() - LOCK_EXPIRADO_MS);

  const existente = await collection.findOne({ _id: MANUTENCAO_PRODUTOS_VERSAO });
  if (existente && existente.status === 'concluida') {
    return { reservado: false, motivo: 'ja_concluida' };
  }
  if (existente && existente.status === 'rodando' && existente.atualizado_em > expiradoAntesDe) {
    return { reservado: false, motivo: 'em_andamento' };
  }

  await collection.updateOne(
    { _id: MANUTENCAO_PRODUTOS_VERSAO },
    {
      $set: {
        status: 'rodando',
        iniciado_em: agora,
        atualizado_em: agora
      },
      $setOnInsert: { criado_em: agora }
    },
    { upsert: true }
  );

  return { reservado: true };
}

async function executarManutencaoInicial() {
  if (!manutencaoInicialHabilitada()) return { status: 'desabilitada' };

  const collection = mongoose.connection.collection('maintenance_locks');
  const agora = new Date();
  const reserva = await tentarReservarExecucao(collection, agora);
  if (!reserva.reservado) {
    return { status: 'ignorada', motivo: reserva.motivo };
  }

  try {
    const resultado = await organizarProdutos({ aplicar: true });
    await collection.updateOne(
      { _id: MANUTENCAO_PRODUTOS_VERSAO },
      {
        $set: {
          status: 'concluida',
          concluido_em: new Date(),
          atualizado_em: new Date(),
          resultado
        }
      }
    );
    return { status: 'concluida', resultado };
  } catch (err) {
    await collection.updateOne(
      { _id: MANUTENCAO_PRODUTOS_VERSAO },
      {
        $set: {
          status: 'falhou',
          atualizado_em: new Date(),
          erro: err.message
        }
      }
    );
    throw err;
  }
}

module.exports = { executarManutencaoInicial, manutencaoInicialHabilitada };
