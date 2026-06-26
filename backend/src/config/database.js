const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/comparador_precos';
  await mongoose.connect(uri, {
    autoIndex: process.env.NODE_ENV !== 'production'
  });
  console.log('MongoDB conectado');
}

module.exports = connectDB;
