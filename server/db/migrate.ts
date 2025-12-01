import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from '../../shared/schema';

neonConfig.webSocketConstructor = ws;

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('Starting database migration...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });
  
  try {
    console.log('Running migrations from ./drizzle directory...');
    
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
