// Database configuration using Neon PostgreSQL with Drizzle ORM
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../shared/schema";
import { securityAuditLog } from "../shared/schema";
import { 
  startQueryTimer, 
  endQueryTimer, 
  parseQueryTypeAndTable,
  registerSlowQueryLogger 
} from "./db/queryMonitor";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const basePool = new Pool({ connectionString: process.env.DATABASE_URL });

const originalQuery = basePool.query.bind(basePool) as (...args: any[]) => Promise<any>;
basePool.query = async function instrumentedQuery(...args: any[]): Promise<any> {
  const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
  const { queryType, tableName } = parseQueryTypeAndTable(sql);
  
  if (tableName === 'security_audit_log' && queryType === 'INSERT') {
    return originalQuery.apply(basePool, args);
  }
  
  const queryId = startQueryTimer(queryType, tableName);
  
  try {
    const result = await originalQuery.apply(basePool, args);
    const rowCount = result?.rowCount || (Array.isArray(result?.rows) ? result.rows.length : 0);
    await endQueryTimer(queryId, true, rowCount);
    return result;
  } catch (error) {
    await endQueryTimer(queryId, false, 0, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
} as typeof basePool.query;

export const pool = basePool;
export const db = drizzle({ client: pool, schema });

registerSlowQueryLogger(async (eventType: string, severity: string, metadata: Record<string, any>) => {
  try {
    await db.insert(securityAuditLog).values({
      eventType,
      severity,
      metadata,
    });
  } catch (error) {
    console.error('Failed to log to security_audit_log:', error);
  }
});
