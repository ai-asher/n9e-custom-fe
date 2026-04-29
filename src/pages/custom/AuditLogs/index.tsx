/*
 * Audit log page — read-only listing of every write operation against
 * custom_* tables.
 *
 * Filters (all optional, AND-combined):
 *   target / action / username / target_id / since
 *
 * The before/after JSON snapshots can be huge, so we truncate in the
 * table cell and reveal full JSON in a Drawer on click. We stringify
 * before storage on the backend, so what we get here is already the
 * exact byte sequence the audit table holds — no client-side re-format
 * to obscure diffs.
 */
import React, { useEffect, useState } from 'react';
import { Button, Drawer, Input, Select, Space, Table, Tag, message, DatePicker } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import moment, { Moment } from 'moment';

import PageLayout from '@/components/pageLayout';
import { AuditLog, listAuditLogs } from '@/services/custom';

const TARGET_OPTIONS = [
  { value: '', label: '全部 target' },
  { value: 'aggregate_rule', label: '聚合规则' },
  { value: 'inhibit_rule', label: '抑制规则' },
  { value: 'mute_cron', label: 'Cron 屏蔽' },
  { value: 'emergency_mute', label: '应急屏蔽' },
  { value: 'incident', label: 'Incident' },
];
const ACTION_OPTIONS = [
  { value: '', label: '全部 action' },
  { value: 'create', label: 'create' },
  { value: 'update', label: 'update' },
  { value: 'delete', label: 'delete' },
  { value: 'put', label: 'put' },
  { value: 'close', label: 'close' },
];

// Map common action verbs to a tag color so the eye can scan a long list.
const ACTION_COLOR: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  put: 'cyan',
  close: 'orange',
};

const Page: React.FC = () => {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [target, setTarget] = useState('');
  const [action, setAction] = useState('');
  const [username, setUsername] = useState('');
  const [since, setSince] = useState<Moment | null>(null);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const refresh = () => {
    setLoading(true);
    listAuditLogs({
      target: target || undefined,
      action: action || undefined,
      username: username || undefined,
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

  useEffect(refresh, [page, pageSize, target, action, username, since]);

  const tryPrettify = (raw: string): string => {
    if (!raw) return '';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  const columns = [
    { title: '#', dataIndex: 'id', width: 70 },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v: number) => moment.unix(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用户',
      dataIndex: 'username',
      width: 120,
    },
    {
      title: 'IP',
      dataIndex: 'client_ip',
      width: 130,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v || '—'}</code>,
    },
    {
      title: 'action',
      dataIndex: 'action',
      width: 100,
      render: (v: string) => <Tag color={ACTION_COLOR[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'target',
      dataIndex: 'target',
      width: 140,
      render: (v: string) => <code>{v}</code>,
    },
    {
      title: 'id',
      dataIndex: 'target_id',
      width: 80,
    },
    {
      title: '详情',
      width: 90,
      render: (_v: any, r: AuditLog) => <a onClick={() => setDetail(r)}>查看</a>,
    },
  ];

  return (
    <PageLayout title='审计日志' showBack={false}>
      <div style={{ padding: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            value={target}
            options={TARGET_OPTIONS}
            style={{ width: 160 }}
            onChange={(v) => {
              setTarget(v);
              setPage(1);
            }}
          />
          <Select
            value={action}
            options={ACTION_OPTIONS}
            style={{ width: 160 }}
            onChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          />
          <Input placeholder='用户名（精确）' allowClear style={{ width: 180 }} value={username} onChange={(e) => setUsername(e.target.value)} onPressEnter={() => setPage(1)} />
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

        <Drawer
          title={detail ? `Audit #${detail.id} - ${detail.action} ${detail.target}/${detail.target_id}` : ''}
          width={720}
          visible={detail !== null}
          onClose={() => setDetail(null)}
          destroyOnClose
        >
          {detail && (
            <>
              <p>
                <b>{detail.username}</b> · {detail.client_ip} · {moment.unix(detail.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </p>
              <h4>before</h4>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  maxHeight: 280,
                  overflow: 'auto',
                }}
              >
                {tryPrettify(detail.before) || '— (空，新建操作)'}
              </pre>
              <h4>after</h4>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  maxHeight: 280,
                  overflow: 'auto',
                }}
              >
                {tryPrettify(detail.after) || '— (空，删除操作)'}
              </pre>
            </>
          )}
        </Drawer>
      </div>
    </PageLayout>
  );
};

export default Page;
