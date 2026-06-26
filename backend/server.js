require('dotenv').config();

const cluster = require('cluster');
const os = require('os');
const connectDB = require('./src/config/database');

const PORT = process.env.PORT || 3001;
const WORKERS = Math.max(1, Math.min(
  Number(process.env.WEB_CONCURRENCY) || 1,
  os.cpus().length
));

function iniciarWorker() {
  const app = require('./src/app');
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`API rodando em http://localhost:${PORT} pid=${process.pid}`);
      });
    })
    .catch((err) => {
      console.error('Falha ao conectar no MongoDB:', err.message);
      process.exit(1);
    });
}

if (WORKERS > 1 && cluster.isPrimary) {
  console.log(`Iniciando ${WORKERS} workers da API`);
  for (let i = 0; i < WORKERS; i += 1) cluster.fork();
  cluster.on('exit', (worker) => {
    console.error(`Worker ${worker.process.pid} caiu; reiniciando`);
    cluster.fork();
  });
} else {
  iniciarWorker();
}
