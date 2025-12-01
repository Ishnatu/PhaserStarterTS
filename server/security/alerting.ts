interface AlertPayload {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

interface SlackMessage {
  text: string;
  attachments?: Array<{
    color: string;
    title: string;
    text: string;
    fields?: Array<{ title: string; value: string; short?: boolean }>;
    ts?: number;
  }>;
}

const SLACK_WEBHOOK_URL = process.env.SLACK_SECURITY_WEBHOOK;
const ALERT_COOLDOWN_MS = 60000;
const alertCooldowns = new Map<string, number>();

function shouldThrottle(alertKey: string): boolean {
  const lastSent = alertCooldowns.get(alertKey);
  if (!lastSent) return false;
  return Date.now() - lastSent < ALERT_COOLDOWN_MS;
}

function recordAlert(alertKey: string): void {
  alertCooldowns.set(alertKey, Date.now());
}

function getLevelColor(level: AlertPayload['level']): string {
  switch (level) {
    case 'critical': return '#ff0000';
    case 'warning': return '#ffaa00';
    case 'info': return '#0088ff';
  }
}

function getLevelEmoji(level: AlertPayload['level']): string {
  switch (level) {
    case 'critical': return '🚨';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
  }
}

function formatSlackMessage(alert: AlertPayload): SlackMessage {
  const fields = alert.metadata 
    ? Object.entries(alert.metadata).map(([key, value]) => ({
        title: key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
        short: true
      }))
    : [];

  return {
    text: `${getLevelEmoji(alert.level)} *${alert.level.toUpperCase()}*: ${alert.title}`,
    attachments: [{
      color: getLevelColor(alert.level),
      title: alert.title,
      text: alert.message,
      fields,
      ts: Math.floor(Date.now() / 1000)
    }]
  };
}

export async function sendSecurityAlert(alert: AlertPayload): Promise<boolean> {
  const alertKey = `${alert.level}:${alert.title}`;
  
  if (shouldThrottle(alertKey)) {
    console.log(`[ALERT] Throttled: ${alertKey}`);
    return false;
  }

  alert.timestamp = alert.timestamp || new Date().toISOString();

  console.log(`[SECURITY ALERT] ${alert.level.toUpperCase()}: ${alert.title} - ${alert.message}`);

  if (!SLACK_WEBHOOK_URL) {
    console.log('[ALERT] No Slack webhook configured - alert logged only');
    return true;
  }

  try {
    const slackMessage = formatSlackMessage(alert);
    
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    if (!response.ok) {
      console.error(`[ALERT] Slack webhook failed: ${response.status}`);
      return false;
    }

    recordAlert(alertKey);
    return true;
  } catch (error) {
    console.error('[ALERT] Failed to send Slack alert:', error);
    return false;
  }
}

export async function alertCritical(title: string, message: string, metadata?: Record<string, any>): Promise<boolean> {
  return sendSecurityAlert({ level: 'critical', title, message, metadata });
}

export async function alertWarning(title: string, message: string, metadata?: Record<string, any>): Promise<boolean> {
  return sendSecurityAlert({ level: 'warning', title, message, metadata });
}

export async function alertInfo(title: string, message: string, metadata?: Record<string, any>): Promise<boolean> {
  return sendSecurityAlert({ level: 'info', title, message, metadata });
}

export async function alertSlowQuery(queryType: string, tableName: string, durationMs: number): Promise<boolean> {
  const level = durationMs >= 5000 ? 'critical' : 'warning';
  return sendSecurityAlert({
    level,
    title: 'Slow Database Query Detected',
    message: `Query on ${tableName} took ${durationMs}ms`,
    metadata: { queryType, tableName, durationMs }
  });
}

export async function alertSecurityEvent(eventType: string, details: string, metadata?: Record<string, any>): Promise<boolean> {
  const criticalEvents = [
    'SUSPICIOUS_WITHDRAWAL',
    'RATE_LIMIT_EXCEEDED',
    'INVALID_SIGNATURE',
    'BOT_DETECTED',
    'ADMIN_ACCESS_FAILED'
  ];

  const level = criticalEvents.includes(eventType) ? 'critical' : 'warning';
  
  return sendSecurityAlert({
    level,
    title: `Security Event: ${eventType}`,
    message: details,
    metadata
  });
}

export async function alertDependencyVulnerability(severity: string, packageName: string, advisory: string): Promise<boolean> {
  const level = severity === 'critical' || severity === 'high' ? 'critical' : 'warning';
  
  return sendSecurityAlert({
    level,
    title: 'Dependency Vulnerability Found',
    message: `${severity.toUpperCase()} vulnerability in ${packageName}`,
    metadata: { severity, packageName, advisory }
  });
}

export function getAlertingStatus(): { configured: boolean; cooldownEntries: number } {
  return {
    configured: !!SLACK_WEBHOOK_URL,
    cooldownEntries: alertCooldowns.size
  };
}
