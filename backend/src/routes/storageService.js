const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function uploadFileToR2(fileBuffer, fileName, mimeType) {
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
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  } catch (error) {
    console.error('Erro ao enviar arquivo para o Cloudflare R2:', error);
    throw new Error('Falha no upload do arquivo.');
  }
}

/**
 * Remove um arquivo do Cloudflare R2 com base na sua URL pública
 * @param {string} fileUrl - URL pública do arquivo a ser apagado
 */
async function deleteFileFromR2(fileUrl) {
  if (!fileUrl) return;

  try {
    // Se a foto antiga for do Google (ex: googleusercontent.com), não tentamos apagar do R2
    if (fileUrl.includes('googleusercontent.com') || fileUrl.includes('placeholder.com')) {
      return;
    }

    // Extrai a chave (ex: uploads/171...-avatar.jpg) a partir da URL pública
    const publicUrlBase = process.env.R2_PUBLIC_URL;
    const key = fileUrl.replace(`${publicUrlBase}/`, '');

    if (!key || key === fileUrl) return;

    const deleteParams = {
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    };

    await s3Client.send(new DeleteObjectCommand(deleteParams));
  } catch (error) {
    console.error('Erro ao deletar arquivo antigo do R2:', error);
    // Não lançamos o erro aqui para não travar o fluxo principal caso a foto antiga já não exista
  }
}

module.exports = { uploadFileToR2, deleteFileFromR2 };