export const NS = 'event-pipelines';
export const PERM = `/${NS}`;
export const DEFAULT_PROCESSOR_CONFIG_MAP = {
  relabel: {
    action: 'replace',
  },
  callback: {
    timeout: 10000,
  },
  event_update: {
    timeout: 10000,
  },
  // alert_aggregate config is intentionally minimal: the rich rule
  // definition (dimensions, window, storm threshold) lives in the
  // custom_aggregate_rule table, not in pipeline config. The 'mode'
  // field tells the processor what to do when a rule matches.
  alert_aggregate: {
    mode: 'drop_merged',
  },
};
export const DEFAULT_VALUES = {
  processors: [
    {
      typ: 'relabel',
      config: DEFAULT_PROCESSOR_CONFIG_MAP['relabel'],
    },
  ],
};
