/*
 * Suppressed events page — read-only timeline of "who muted whom".
 *
 * Each row corresponds to one suppression decision: a target event arrived,
 * matched some inhibit rule's target_match, and the active source under
 * that rule (with matching equal_labels) absorbed it.
 *
 * The page is intentionally minimalist:
 *   - newest-first list, paginated
 *   - filter by rule / source-hash / target-hash / since
 *   - drawer shows source vs. target side-by-side (rule_name + tags +
 *     severity), so an oncall can confirm "yes, this WAS the right call"
 *     in two seconds.
 *
 * What this page does NOT do:
 *   - It does not let you "unsuppress" — past decisions are immutable
 *     audit data; if a rule is wrong, fix the rule.
 *   - It does not link to alert_his_event detail; we keep snapshot fields
 *     locally so the page works even after the underlying events have
 *     rotated out of N9e's retention window.
 */
import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Descriptions, Drawer, Input, Space, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import moment, { Moment } from 'moment';

import PageLayout from '@/components/pageLayout';
import { SuppressedEvent, listSuppressedEvents } from '@/services/custom';

const SEVERITY_LABEL: Record<number, { text: string; color: string }> = {
  1: { text: 'Critical', color: 'red' },
  2: { text: 'Warning', color: 'orange' },
  3: { text: 'Info', color: 'blue' },
};

const Page: React.FC = () => {
  const [rows, setRows] = useState<SuppressedEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [ruleId, setRuleId] = useState<string>('');
  const [sourceHash, setSourceHash] = useState<string>('');
  const [targetHash, setTargetHash] = useState<string>('');
  const [since, setSince] = useState<Moment | null>(null);
  const [detail, setDetail] = useState<SuppressedEvent | null>(null);

  const refresh = () => {
    setLoading(true);
    listSuppressedEvents({
      rule_id: ruleId ? Number(ruleId) : undefined,
      source_hash: sourceHash || undefined,
      target_hash: targetHash || undefined,
      since: since ? since.unix() : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
      .then((res: any) => {
        setRows(res?.dat?.list ?? []);
        setTotal(res?.dat?.total ?? 0);
      })
      .catch((e) => message.error(`load failed: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [page, pageSize, ruleId, sourceHash, targetHash, since]);

  const renderSeverity = (s: number) => {
    const meta = SEVERITY_LABEL[s] ?? { text: `S${s}`, color: 'default' };
    return <Tag color={meta.color}>{meta.text}</Tag>;
  };

  const columns = [
    { title: '#', dataIndex: 'id', width: 70 },
    {
      title: '抑制时间',
      dataIndex: 'suppressed_at',
      width: 170,
      render: (v: number) => moment.unix(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '规则',
      width: 200,
      render: (_v: any, r: SuppressedEvent) => (
        <Space size={4} direction='vertical'>
          <span style={{ fontWeight: 500 }}>{r.rule_name || `rule-${r.rule_id}`}</span>
          <span style={{ color: '#999', fontSize: 12 }}>id={r.rule_id}</span>
        </Space>
      ),
    },
    {
      title: '根因 (source)',
      render: (_v: any, r: SuppressedEvent) => (
        <Space size={4} direction='vertical'>
          <span>
            {renderSeverity(r.source_severity)} {r.source_rule_name || '—'}
          </span>
          <code style={{ fontSize: 12, color: '#666' }}>{r.source_event_hash}</code>
        </Space>
      ),
    },
    {
      title: '被抑制 (target)',
      render: (_v: any, r: SuppressedEvent) => (
        <Space size={4} direction='vertical'>
          <span>
            {renderSeverity(r.target_severity)} {r.target_rule_name || '—'}
          </span>
          <code style={{ fontSize: 12, color: '#666' }}>{r.target_event_hash}</code>
        </Space>
      ),
    },
    {
      title: '详情',
      width: 80,
      render: (_v: any, r: SuppressedEvent) => <a onClick={() => setDetail(r)}>查看</a>,
    },
  ];

  return (
    <PageLayout title='被抑制告警' showBack={false}>
      <div style={{ padding: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input placeholder='规则 ID' allowClear style={{ width: 120 }} value={ruleId} onChange={(e) => setRuleId(e.target.value)} onPressEnter={() => setPage(1)} />
          <Input
            placeholder='source event hash'
            allowClear
            style={{ width: 220 }}
            value={sourceHash}
            onChange={(e) => setSourceHash(e.target.value)}
            onPressEnter={() => setPage(1)}
          />
          <Input
            placeholder='target event hash'
            allowClear
            style={{ width: 220 }}
            value={targetHash}
            onChange={(e) => setTargetHash(e.target.value)}
            onPressEnter={() => setPage(1)}
          />
          <DatePicker
            showTime
            placeholder='起始时间'
            value={since}
            onChange={(v) => {
              setSince(v);
              setPage(1);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
        </Space>

        <Table
          rowKey='id'
          loading={loading}
          dataSource={rows}
          columns={columns}
          size='small'
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps || 50);
            },
          }}
        />

        <Drawer title={detail ? `抑制详情 #${detail.id}` : ''} width={720} visible={detail !== null} onClose={() => setDetail(null)} destroyOnClose>
          {detail && (
            <>
              <Descriptions column={1} size='small' bordered>
                <Descriptions.Item label='抑制时间'>{moment.unix(detail.suppressed_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label='抑制规则'>
                  #{detail.rule_id} {detail.rule_name || '—'}
                </Descriptions.Item>
              </Descriptions>

              <h4 style={{ marginTop: 16 }}>根因 (source)</h4>
              <Descriptions column={1} size='small' bordered>
                <Descriptions.Item label='告警规则名'>{detail.source_rule_name || '—'}</Descriptions.Item>
                <Descriptions.Item label='严重度'>{renderSeverity(detail.source_severity)}</Descriptions.Item>
                <Descriptions.Item label='事件 hash'>
                  <code>{detail.source_event_hash}</code>
                </Descriptions.Item>
                <Descriptions.Item label='标签'>
                  <pre style={{ margin: 0, fontSize: 12 }}>{detail.source_tags || '—'}</pre>
                </Descriptions.Item>
              </Descriptions>

              <h4 style={{ marginTop: 16 }}>被抑制 (target)</h4>
              <Descriptions column={1} size='small' bordered>
                <Descriptions.Item label='告警规则名'>{detail.target_rule_name || '—'}</Descriptions.Item>
                <Descriptions.Item label='严重度'>{renderSeverity(detail.target_severity)}</Descriptions.Item>
                <Descriptions.Item label='事件 hash'>
                  <code>{detail.target_event_hash}</code>
                </Descriptions.Item>
                <Descriptions.Item label='标签'>
                  <pre style={{ margin: 0, fontSize: 12 }}>{detail.target_tags || '—'}</pre>
                </Descriptions.Item>
              </Descriptions>
            </>
          )}
        </Drawer>
      </div>
    </PageLayout>
  );
};

export default Page;
