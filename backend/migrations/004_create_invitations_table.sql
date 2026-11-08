-- Migration: Criar tabela de convites com suporte a e-mail, link único e convite direto

CREATE TABLE IF NOT EXISTS invitations (
  id SERIAL PRIMARY KEY,
  inviter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email VARCHAR(255),
  invitee_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role_to_grant VARCHAR(20) NOT NULL,
  code VARCHAR(64) UNIQUE,
  type VARCHAR(20) NOT NULL, -- 'email', 'code', 'direct'
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'revoked'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para buscas rápidas de validação de convite
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(invitee_email) WHERE invitee_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(invitee_user_id) WHERE invitee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);