exports.up = pgm => {
  pgm.createTable('posts', {
    id: 'id',
    author: { type: 'varchar(100)', notNull: true },
    avatar: { type: 'text' },
    category: { type: 'varchar(50)' },
    title: { type: 'text' },
    text: { type: 'text' },
    image: { type: 'text' },
    ratings: { type: 'int[]', default: pgm.func('ARRAY[]::INT[]') },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
};

exports.down = pgm => {
  pgm.dropTable('posts');
};