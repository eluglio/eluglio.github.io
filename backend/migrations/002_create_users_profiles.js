exports.up = pgm => {
  // Tabela de Autenticação
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'varchar(150)', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Tabela de Perfis Públicos
  pgm.createTable('profiles', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: '"users"',
      onDelete: 'cascade',
    },
    name: { type: 'varchar(100)', notNull: true },
    avatar_url: { type: 'text' },
    bio: { type: 'text' },
    social_links: { type: 'jsonb', default: '{}' },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
};

exports.down = pgm => {
  pgm.dropTable('profiles');
  pgm.dropTable('users');
};