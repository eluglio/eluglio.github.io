-- Migration: Rastrear quem convidou quem para validação de hierarquia e revogação

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS invited_by INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_invited_by ON profiles(invited_by);