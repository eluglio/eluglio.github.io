-- Migration: Adicionar coluna de role na tabela profiles e ajustar permissões padrão

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'consumer';

-- Índices para otimizar consultas por nível de acesso
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);