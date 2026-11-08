const fs = require('fs');
const path = require('path');
const pool = require('./config/db'); // Ajuste o caminho para o seu arquivo de conexão com o banco

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Verificando e executando migrations...');

    // 1. Cria a tabela de controle de migrations se ela não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Define o caminho para a pasta 'migrations' (na raiz do backend)
    const migrationsDir = path.join(__dirname, '../migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️ Pasta de migrations não encontrada em:', migrationsDir);
      return;
    }

    // Lê todos os arquivos .sql e ordena em ordem alfabética (001, 002, etc.)
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // 3. Busca quais arquivos já foram executados anteriormente
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const executedFiles = new Set(rows.map(r => r.filename));

    // 4. Executa apenas as migrations pendentes
    for (const file of files) {
      if (!executedFiles.has(file)) {
        console.log(`🚀 Executando migration pendente: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        await client.query('BEGIN');
        try {
          // Executa o script SQL da migration
          await client.query(sql);
          // Registra que o arquivo foi executado com sucesso
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          
          await client.query('COMMIT');
          console.log(`✅ Migration concluída com sucesso: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`❌ Erro ao executar a migration ${file}:`, err);
          throw err;
        }
      }
    }

    console.log('✨ Banco de dados atualizado com todas as migrations!');
  } catch (err) {
    console.error('❌ Erro crítico no processo de migrations:', err);
    process.exit(1); // Encerra o processo se houver falha estrutural
  } finally {
    client.release();
  }
}

module.exports = runMigrations;