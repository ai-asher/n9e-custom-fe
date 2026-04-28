/*
 * Service layer for the custom denoise/suppress/mute backend.
 *
 * All endpoints live under /api/n9e/custom/ — see internal/custom/router/
 * in the n9e-custom backend repo. Auth is handled transparently by
 * @/utils/request (it injects the JWT from local storage).
 *
 * Why one big file instead of one per resource:
 *   The resources share identical request/response shapes (the API was
 *   designed in lock-step with this file), so splitting yields more import
 *   noise than clarity. If a single resource grows complex enough to need
 *   its own file, that's a clean refactor — for now keep it together.
 */
import request from '@/utils/request';
import { RequestMethod } from '@/store/common';

const PREFIX = '/api/n9e/custom';

// ─── Aggregate Rules ────────────────────────────────────────────

export interface AggregateRule {
  id: number;
  group_id: number;
  name: string;
  note: string;
  dimensions: string[];
  window_sec: number;
  filters: any[];
  datasource_ids: number[] | null;
  severities: number[] | null;
  storm_threshold: number;
  storm_window_sec: number;
  disabled: number;
  priority: number;
  create_by: string;
  update_by: string;
  create_at: number;
  update_at: number;
}

export interface AggregateRuleWriteReq {
  group_id?: number;
  name: string;
  note?: string;
  dimensions: string[];
  window_sec?: number;
  filters?: string;
  datasource_ids?: number[];
  severities?: number[];
  storm_threshold?: number;
  storm_window_sec?: number;
  disabled?: number;
  priority?: number;
}

export const listAggregateRules = () => request(`${PREFIX}/aggregate-rules`, { method: RequestMethod.Get });

export const getAggregateRule = (id: number) => request(`${PREFIX}/aggregate-rule/${id}`, { method: RequestMethod.Get });

export const createAggregateRule = (data: AggregateRuleWriteReq) => request(`${PREFIX}/aggregate-rule`, { method: RequestMethod.Post, data });

export const updateAggregateRule = (id: number, data: AggregateRuleWriteReq) => request(`${PREFIX}/aggregate-rule/${id}`, { method: RequestMethod.Put, data });

export const deleteAggregateRule = (id: number) => request(`${PREFIX}/aggregate-rule/${id}`, { method: RequestMethod.Delete });

// ─── Inhibit Rules ─────────────────────────────────────────────

export interface InhibitRule {
  id: number;
  group_id: number;
  name: string;
  note: string;
  source_match: any[];
  target_match: any[];
  equal_labels: string[];
  datasource_ids: number[] | null;
  disabled: number;
  create_by: string;
  update_by: string;
  create_at: number;
  update_at: number;
}

export interface InhibitRuleWriteReq {
  group_id?: number;
  name: string;
  note?: string;
  source_match: string; // raw JSON string of []TagFilter
  target_match: string;
  equal_labels?: string[];
  datasource_ids?: number[];
  disabled?: number;
}

export const listInhibitRules = () => request(`${PREFIX}/inhibit-rules`, { method: RequestMethod.Get });

export const getInhibitRule = (id: number) => request(`${PREFIX}/inhibit-rule/${id}`, { method: RequestMethod.Get });

export const createInhibitRule = (data: InhibitRuleWriteReq) => request(`${PREFIX}/inhibit-rule`, { method: RequestMethod.Post, data });

export const updateInhibitRule = (id: number, data: InhibitRuleWriteReq) => request(`${PREFIX}/inhibit-rule/${id}`, { method: RequestMethod.Put, data });

export const deleteInhibitRule = (id: number) => request(`${PREFIX}/inhibit-rule/${id}`, { method: RequestMethod.Delete });

// ─── Cron Mute ─────────────────────────────────────────────────

export interface MuteCron {
  id: number;
  group_id: number;
  note: string;
  cron_expr: string;
  duration_sec: number;
  timezone: string;
  datasource_ids: number[] | null;
  severities: number[] | null;
  tags: any[];
  disabled: number;
  create_by: string;
  update_by: string;
  create_at: number;
  update_at: number;
}

export interface MuteCronWriteReq {
  group_id?: number;
  note?: string;
  cron_expr: string;
  duration_sec: number;
  timezone?: string;
  datasource_ids?: number[];
  severities?: number[];
  tags?: string;
  disabled?: number;
}

export const listMuteCrons = () => request(`${PREFIX}/mute-crons`, { method: RequestMethod.Get });

export const getMuteCron = (id: number) => request(`${PREFIX}/mute-cron/${id}`, { method: RequestMethod.Get });

export const createMuteCron = (data: MuteCronWriteReq) => request(`${PREFIX}/mute-cron`, { method: RequestMethod.Post, data });

export const updateMuteCron = (id: number, data: MuteCronWriteReq) => request(`${PREFIX}/mute-cron/${id}`, { method: RequestMethod.Put, data });

export const deleteMuteCron = (id: number) => request(`${PREFIX}/mute-cron/${id}`, { method: RequestMethod.Delete });

// ─── Emergency Mute (singleton) ────────────────────────────────

export interface EmergencyMute {
  id: number;
  enabled: number;
  reason: string;
  expire_at: number;
  datasource_ids: number[] | null;
  group_ids: number[] | null;
  create_by: string;
  update_by: string;
  create_at: number;
  update_at: number;
}

export interface EmergencyMutePutReq {
  enabled: number;
  reason?: string;
  expire_at?: number;
  datasource_ids?: number[];
  group_ids?: number[];
}

export const getEmergencyMute = () => request(`${PREFIX}/emergency-mute`, { method: RequestMethod.Get });

export const putEmergencyMute = (data: EmergencyMutePutReq) => request(`${PREFIX}/emergency-mute`, { method: RequestMethod.Put, data });

// ─── Incidents ─────────────────────────────────────────────────

export interface Incident {
  id: number;
  rule_id: number;
  incident_key: string;
  group_id: number;
  group_name: string;
  datasource_id: number;
  severity: number;
  title: string;
  summary: string;
  dimension_values: string;
  status: number; // 0 open, 1 resolved, 2 closed
  event_count: number;
  first_event_at: number;
  last_event_at: number;
  resolved_at: number;
  closed_at: number;
  storm_fired: number;
}

export interface IncidentEvent {
  id: number;
  incident_id: number;
  event_hash: string;
  event_id: number;
  is_recovered: number;
  merged_at: number;
}

export interface IncidentDetail extends Incident {
  events: IncidentEvent[];
}

export const listIncidents = (
  params: {
    status?: number;
    rule_id?: number;
    limit?: number;
    offset?: number;
  } = {},
) => request(`${PREFIX}/incidents`, { method: RequestMethod.Get, params });

export const getIncident = (id: number) => request(`${PREFIX}/incident/${id}`, { method: RequestMethod.Get });

export const closeIncident = (id: number) => request(`${PREFIX}/incident/${id}/close`, { method: RequestMethod.Put });

// ─── Audit Logs ────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  username: string;
  action: string;
  target: string;
  target_id: number;
  before: string;
  after: string;
  client_ip: string;
  created_at: number;
}

export const listAuditLogs = (
  params: {
    target?: string;
    action?: string;
    username?: string;
    target_id?: number;
    since?: number;
    limit?: number;
    offset?: number;
  } = {},
) => request(`${PREFIX}/audit-logs`, { method: RequestMethod.Get, params });
