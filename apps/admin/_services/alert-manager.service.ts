import crypto from 'crypto';

import { AzureNamedKeyCredential, TableClient } from '@azure/data-tables';

type MonitorCondition = 'Fired' | 'Resolved';
type AlertManagerAction = 'sent' | 'suppressed' | 'resolved_recorded' | 'ignored';

export type NormalizedAlertPayload = {
  alertRule: string;
  alertRuleId?: string;
  monitorCondition: MonitorCondition;
  severity: string;
  resourceId: string;
  firedDateTime: string;
  description?: string;
  alertContext: Record<string, unknown>;
};

export type AlertManagerThrottleEntity = {
  partitionKey: string;
  rowKey: string;
  alertRuleName: string;
  resourceId: string;
  currentMonitorCondition: MonitorCondition;
  incidentStartedAt: string;
  lastFiredEmailAt?: string;
  lastResolvedEmailAt?: string;
  lastSeverity: string;
  lastPayloadSummary: string;
};

export type AlertManagerThrottleStore = {
  get(partitionKey: string, rowKey: string): Promise<AlertManagerThrottleEntity | null>;
  upsert(entity: AlertManagerThrottleEntity): Promise<void>;
};

export type AlertManagerResult = {
  action: AlertManagerAction;
  reason: string;
};

type AlertManagerServiceOptions = {
  environment?: string;
  throttleMinutes?: number;
  managerRecipients?: string[];
  now?: () => Date;
  store?: AlertManagerThrottleStore;
  sendManagerEmail?: (alert: NormalizedAlertPayload, recipients: string[]) => Promise<void>;
};

const MANAGER_ALERT_ALLOW_LIST = new Set([
  'Innovation Service Main Website',
  'Innovation Service Informational CPU',
  'Innovation Service Informational Memory',
  'Innovation Service App Gateway Unhealthy Hosts'
]);

export class AzureTableAlertManagerThrottleStore implements AlertManagerThrottleStore {
  private readonly tableClient: TableClient;

  constructor() {
    const connectionString = process.env['AZURE_STORAGE_CONNECTIONSTRING'] || '';
    const tableName = process.env['ALERT_MANAGER_TABLE_NAME'] || 'alertmanagerthrottle';

    if (connectionString.includes('AccountName=') && connectionString.includes('AccountKey=')) {
      this.tableClient = TableClient.fromConnectionString(connectionString, tableName);
      return;
    }

    const accountName = process.env['ALERT_MANAGER_STORAGE_ACCOUNT_NAME'] || '';
    const accountKey = process.env['ALERT_MANAGER_STORAGE_ACCOUNT_KEY'] || '';
    const endpoint = `https://${accountName}.table.core.windows.net`;
    this.tableClient = new TableClient(endpoint, tableName, new AzureNamedKeyCredential(accountName, accountKey));
  }

  async get(partitionKey: string, rowKey: string): Promise<AlertManagerThrottleEntity | null> {
    console.log('[AlertManager] Reading throttle entity', { partitionKey, rowKey });

    try {
      return await this.tableClient.getEntity<AlertManagerThrottleEntity>(partitionKey, rowKey);
    } catch (error: any) {
      if (error.statusCode === 404) {
        console.log('[AlertManager] No existing throttle entity found', { partitionKey, rowKey });
        return null;
      }
      throw error;
    }
  }

  async upsert(entity: AlertManagerThrottleEntity): Promise<void> {
    console.log('[AlertManager] Upserting throttle entity', {
      partitionKey: entity.partitionKey,
      rowKey: entity.rowKey,
      currentMonitorCondition: entity.currentMonitorCondition
    });
    await this.tableClient.upsertEntity(entity, 'Merge');
  }
}

export class AlertManagerService {
  private readonly environment: string;
  private readonly throttleMinutes: number;
  private readonly managerRecipients: string[];
  private readonly now: () => Date;
  private readonly store: AlertManagerThrottleStore;
  private readonly sendManagerEmail: (alert: NormalizedAlertPayload, recipients: string[]) => Promise<void>;

  constructor(options: AlertManagerServiceOptions = {}) {
    this.environment = options.environment ?? process.env['ALERT_MANAGER_ENVIRONMENT'] ?? 'dev';
    this.throttleMinutes = options.throttleMinutes ?? Number(process.env['ALERT_MANAGER_THROTTLE_MINUTES'] || 4);
    this.managerRecipients =
      options.managerRecipients ??
      (process.env['ALERT_MANAGER_EMAIL_RECIPIENTS'] || '')
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);
    this.now = options.now ?? (() => new Date());
    this.store = options.store ?? new AzureTableAlertManagerThrottleStore();
    this.sendManagerEmail = options.sendManagerEmail ?? this.logManagerEmail;
  }

  normalizePayload(payload: any): NormalizedAlertPayload {
    console.log('[AlertManager] Normalizing Azure Monitor payload', { schemaId: payload?.schemaId });

    if (payload?.schemaId !== 'azureMonitorCommonAlertSchema') {
      throw new Error('Unsupported Azure Monitor alert schema');
    }

    const essentials = payload.data?.essentials;
    const alertRule = essentials?.alertRule;
    const monitorCondition = essentials?.monitorCondition;
    const resourceId = essentials?.alertTargetIDs?.[0];
    const firedDateTime = essentials?.firedDateTime;

    if (!alertRule || !monitorCondition || !resourceId || !firedDateTime) {
      throw new Error('Invalid Azure Monitor common alert payload');
    }

    if (!['Fired', 'Resolved'].includes(monitorCondition)) {
      throw new Error('Unsupported Azure Monitor monitor condition');
    }

    return {
      alertRule,
      ...(essentials.alertRuleId && { alertRuleId: essentials.alertRuleId }),
      monitorCondition,
      severity: essentials.severity ?? 'Unknown',
      resourceId,
      firedDateTime,
      ...(essentials.description && { description: essentials.description }),
      alertContext: payload.data?.alertContext ?? {}
    };
  }

  buildThrottleRowKey(alert: NormalizedAlertPayload): string {
    const keySource = `${alert.alertRuleId ?? alert.alertRule}${alert.resourceId}`;
    return crypto.createHash('sha256').update(keySource).digest('hex');
  }

  async handleAlert(payload: any): Promise<AlertManagerResult> {
    const alert = this.normalizePayload(payload);
    console.log('[AlertManager] Handling alert', {
      alertRule: alert.alertRule,
      monitorCondition: alert.monitorCondition,
      resourceId: alert.resourceId
    });

    if (!MANAGER_ALERT_ALLOW_LIST.has(alert.alertRule)) {
      console.log('[AlertManager] Alert ignored because it is not manager-approved', { alertRule: alert.alertRule });
      return { action: 'ignored', reason: 'Alert is not manager-approved' };
    }

    const partitionKey = this.environment;
    const rowKey = this.buildThrottleRowKey(alert);
    const existing = await this.store.get(partitionKey, rowKey);
    const nowIso = this.now().toISOString();
    const baseEntity: AlertManagerThrottleEntity = {
      partitionKey,
      rowKey,
      alertRuleName: alert.alertRule,
      resourceId: alert.resourceId,
      currentMonitorCondition: alert.monitorCondition,
      incidentStartedAt: existing?.incidentStartedAt ?? alert.firedDateTime,
      lastFiredEmailAt: existing?.lastFiredEmailAt,
      lastResolvedEmailAt: existing?.lastResolvedEmailAt,
      lastSeverity: alert.severity,
      lastPayloadSummary: JSON.stringify({
        alertRule: alert.alertRule,
        severity: alert.severity,
        monitorCondition: alert.monitorCondition,
        firedDateTime: alert.firedDateTime
      })
    };

    if (alert.monitorCondition === 'Resolved') {
      console.log('[AlertManager] Resolved alert recorded without manager email', { rowKey });
      await this.store.upsert({ ...baseEntity, lastResolvedEmailAt: nowIso });
      return { action: 'resolved_recorded', reason: 'Resolved alert recorded without manager email' };
    }

    if (this.shouldSuppress(existing?.lastFiredEmailAt)) {
      console.log('[AlertManager] Fired alert suppressed by throttle window', {
        rowKey,
        lastFiredEmailAt: existing?.lastFiredEmailAt,
        throttleMinutes: this.throttleMinutes
      });
      await this.store.upsert(baseEntity);
      return { action: 'suppressed', reason: 'Manager email suppressed by throttle window' };
    }

    console.log('[AlertManager] Fired alert will send manager email', {
      rowKey,
      recipients: this.managerRecipients,
      throttleMinutes: this.throttleMinutes
    });
    await this.sendManagerEmail(alert, this.managerRecipients);
    await this.store.upsert({ ...baseEntity, lastFiredEmailAt: nowIso });

    return { action: 'sent', reason: 'Manager email sent' };
  }

  private shouldSuppress(lastFiredEmailAt?: string): boolean {
    if (!lastFiredEmailAt) {
      return false;
    }

    const elapsedMs = this.now().getTime() - new Date(lastFiredEmailAt).getTime();
    return elapsedMs < this.throttleMinutes * 60 * 1000;
  }

  private async logManagerEmail(alert: NormalizedAlertPayload, recipients: string[]): Promise<void> {
    console.log('[AlertManager] Manager email would be sent', {
      recipients,
      subject: `[${this.environment.toUpperCase()} Alert] ${alert.alertRule}`,
      alertRule: alert.alertRule,
      status: alert.monitorCondition,
      severity: alert.severity,
      resourceId: alert.resourceId,
      firedDateTime: alert.firedDateTime,
      description: alert.description
    });
  }
}
