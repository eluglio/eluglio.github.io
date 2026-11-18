-- Migration: 008_add_user_id_to_posts.sql

-- 1. Adiciona a coluna user_id vinculada à tabela users
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE CASCADE;

-- 2. Remove a obrigatoriedade da coluna antiga 'author' para não quebrar os novos inserts
ALTER TABLE posts 
ALTER COLUMN author DROP NOT NULL;

-- 3. Índice para otimizar buscas de posts por usuário
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);