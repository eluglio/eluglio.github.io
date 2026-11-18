/* Configuração global da aplicação. */

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : 'https://eluglio.onrender.com/api';

const GOOGLE_CLIENT_ID = "608368891362-meo2l65gssan7fieblloir35s3cat4rr.apps.googleusercontent.com";

// Publicações: limite e formatos de mídia aceitos
const POST_MEDIA_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const POST_MEDIA_ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime'
];
