const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// Configuração do cliente S3 apontando para o Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Faz o upload de um arquivo para o Cloudflare R2
 * @param {Buffer} fileBuffer - O buffer do arquivo
 * @param {string} fileName - Nome original do arquivo
 * @param {string} mimeType - Tipo do arquivo (ex: 'image/jpeg', 'video/mp4')
 * @returns {string} - URL pública do arquivo enviado
 */
async function uploadFileToR2(fileBuffer, fileName, mimeType) {
  // Gera um nome único para evitar conflitos (ex: a1b2c3d4-foto.jpg)
  const uniqueSuffix = crypto.randomBytes(8).toString('hex');
  const sanitizedFileName = fileName.replace(/\s+/g, '-');
  const key = `uploads/${Date.now()}-${uniqueSuffix}-${sanitizedFileName}`;

  const uploadParams = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    
    // Retorna a URL pública pronta para ser salva no PostgreSQL
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  } catch (error) {
    console.error('Erro ao enviar arquivo para o Cloudflare R2:', error);
    throw new Error('Falha no upload do arquivo.');
  }
}

module.exports = { uploadFileToR2 };