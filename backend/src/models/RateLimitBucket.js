const mongoose = require('mongoose');

const rateLimitBucketSchema = new mongoose.Schema({
  chave:        { type: String, required: true, unique: true, maxlength: 64 },
  contador:     { type: Number, required: true, default: 0 },
  expira_em:    { type: Date, required: true },
  atualizado_em:{ type: Date, default: Date.now }
}, { versionKey: false });

rateLimitBucketSchema.index({ expira_em: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimitBucket', rateLimitBucketSchema);
