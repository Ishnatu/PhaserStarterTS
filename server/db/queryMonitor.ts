interface QueryMetrics {
  queryId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  queryType: string;
  tableName?: string;
  rowCount?: number;
  success: boolean;
  error?: string;
}

interface QueryStats {
  totalQueries: number;
  slowQueries: number;
  failedQueries: number;
  averageDuration: number;
  p95Duration: number;
  p99Duration: number;
  queriesByType: Record<string, number>;
  slowestQueries: QueryMetrics[];
}

const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10);
const CRITICAL_QUERY_THRESHOLD_MS = parseInt(process.env.CRITICAL_QUERY_THRESHOLD_MS || '5000', 10);
const MAX_STORED_METRICS = 1000;
const MAX_SLOW_QUERIES_STORED = 100;

const queryMetrics: QueryMetrics[] = [];
const slowQueries: QueryMetrics[] = [];
let totalQueryCount = 0;
let slowQueryCount = 0;
let failedQueryCount = 0;

type SlowQueryLogger = (eventType: string, severity: string, metadata: Record<string, any>) => Promise<void>;
let slowQueryLogger: SlowQueryLogger | null = null;

export function registerSlowQueryLogger(logger: SlowQueryLogger): void {
  slowQueryLogger = logger;
}

function generateQueryId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function startQueryTimer(queryType: string, tableName?: string): string {
  const queryId = generateQueryId();
  const metric: QueryMetrics = {
    queryId,
    startTime: Date.now(),
    queryType,
    tableName,
    success: true,
  };
  
  queryMetrics.push(metric);
  
  while (queryMetrics.length > MAX_STORED_METRICS) {
    queryMetrics.shift();
  }
  
  return queryId;
}

export async function endQueryTimer(
  queryId: string, 
  success: boolean = true, 
  rowCount?: number,
  error?: string
): Promise<void> {
  const metric = queryMetrics.find(m => m.queryId === queryId);
  
  if (!metric) {
    console.warn(`Query metric not found for ID: ${queryId}`);
    return;
  }
  
  metric.endTime = Date.now();
  metric.duration = metric.endTime - metric.startTime;
  metric.success = success;
  metric.rowCount = rowCount;
  metric.error = error;
  
  totalQueryCount++;
  
  if (!success) {
    failedQueryCount++;
  }
  
  if (metric.duration >= SLOW_QUERY_THRESHOLD_MS) {
    slowQueryCount++;
    slowQueries.push({ ...metric });
    
    while (slowQueries.length > MAX_SLOW_QUERIES_STORED) {
      slowQueries.shift();
    }
    
    const severity = metric.duration >= CRITICAL_QUERY_THRESHOLD_MS ? 'critical' : 'warning';
    
    if (slowQueryLogger) {
      try {
        await slowQueryLogger('SLOW_QUERY', severity, {
          queryType: metric.queryType,
          tableName: metric.tableName,
          duration: metric.duration,
          threshold: SLOW_QUERY_THRESHOLD_MS,
          rowCount: metric.rowCount,
        });
      } catch (logError) {
        console.error('Failed to log slow query:', logError);
      }
    }
    
    console.warn(
      `[SLOW_QUERY] ${metric.queryType} on ${metric.tableName || 'unknown'}: ` +
      `${metric.duration}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
    );
  }
}

export function getQueryStats(): QueryStats {
  const completedQueries = queryMetrics.filter(m => m.duration !== undefined);
  const durations = completedQueries.map(m => m.duration!).sort((a, b) => a - b);
  
  const queriesByType: Record<string, number> = {};
  for (const metric of completedQueries) {
    queriesByType[metric.queryType] = (queriesByType[metric.queryType] || 0) + 1;
  }
  
  const avgDuration = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
  
  const p95Index = Math.floor(durations.length * 0.95);
  const p99Index = Math.floor(durations.length * 0.99);
  
  return {
    totalQueries: totalQueryCount,
    slowQueries: slowQueryCount,
    failedQueries: failedQueryCount,
    averageDuration: Math.round(avgDuration),
    p95Duration: durations[p95Index] || 0,
    p99Duration: durations[p99Index] || 0,
    queriesByType,
    slowestQueries: [...slowQueries]
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10),
  };
}

export function resetQueryStats(): void {
  queryMetrics.length = 0;
  slowQueries.length = 0;
  totalQueryCount = 0;
  slowQueryCount = 0;
  failedQueryCount = 0;
}

export async function withQueryMonitoring<T>(
  queryType: string,
  tableName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const queryId = startQueryTimer(queryType, tableName);
  
  try {
    const result = await queryFn();
    const rowCount = Array.isArray(result) ? result.length : 1;
    await endQueryTimer(queryId, true, rowCount);
    return result;
  } catch (error) {
    await endQueryTimer(queryId, false, 0, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export function parseQueryTypeAndTable(sql: string): { queryType: string; tableName: string } {
  const normalized = sql.trim().toUpperCase();
  
  let queryType = 'UNKNOWN';
  if (normalized.startsWith('SELECT')) queryType = 'SELECT';
  else if (normalized.startsWith('INSERT')) queryType = 'INSERT';
  else if (normalized.startsWith('UPDATE')) queryType = 'UPDATE';
  else if (normalized.startsWith('DELETE')) queryType = 'DELETE';
  else if (normalized.startsWith('BEGIN') || normalized.startsWith('COMMIT') || normalized.startsWith('ROLLBACK')) 
    queryType = 'TRANSACTION';
  
  let tableName = 'unknown';
  const fromMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
  const intoMatch = sql.match(/INTO\s+["']?(\w+)["']?/i);
  const updateMatch = sql.match(/UPDATE\s+["']?(\w+)["']?/i);
  const deleteMatch = sql.match(/DELETE\s+FROM\s+["']?(\w+)["']?/i);
  
  if (fromMatch) tableName = fromMatch[1];
  else if (intoMatch) tableName = intoMatch[1];
  else if (updateMatch) tableName = updateMatch[1];
  else if (deleteMatch) tableName = deleteMatch[1];
  
  return { queryType, tableName };
}

export function getSlowQueryThreshold(): number {
  return SLOW_QUERY_THRESHOLD_MS;
}

export function getCriticalQueryThreshold(): number {
  return CRITICAL_QUERY_THRESHOLD_MS;
}
