/*
 * Incident list page — runtime data produced by the aggregator.
 *
 * Read-only except for "manual close" (operator can force-close an open
 * incident even when the underlying events haven't all recovered, e.g.
 * if they fixed it out-of-band and want the timeline to reflect that).
 *
 * The detail drawer shows linked events. We do NOT pull the alert event
 * full payload — only the join rows from custom_incident_event — to keep
 * the page fast on a 10k-incident database. A future iteration could
 * link to the alert_his_event detail page.
 */
import React, { useEffect, useState } from 'react';
import { Button, Drawer, Space, Table, Tag, message, Modal, Descriptions } from 'antd';
import { ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import moment from 'moment';

import PageLayout from '@/components/pageLayout';
import { Incident, IncidentDetail, listIncidents, getIncident, closeIncident } from '@/services/custom';

const { confirm } = Modal;

const STATUS_LABEL: Record<number, { text: string; color: string }> = {
  0: { text: 'OPEN', color: 'red' },
  1: { text: 'RESOLVED', color: 'green' },
  2: { text: 'CLOSED', color: 'default' },
};

// N9e severity convention: 1=Critical, 2=Warning, 3=Info; lower = more severe.
const SEVERITY_LABEL: Record<number, { text: string; color: string }> = {
  1: { text: 'Critical', color: 'red' },
  2: { text: 'Warning', color: 'orange' },
  3: { text: 'Info', color: 'blue' },
};

const Page: React.FC = () => {
  const [rows, setRows] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    listIncidents({
      status: statusFilter,
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

  // Re-fetch on any filter / pagination change. Page deps tracked
  // explicitly so React doesn't loop on setState during refresh.
  useEffect(refresh, [page, pageSize, statusFilter]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res: any = await getIncident(id);
      setDetail(res?.dat ?? null);
    } catch (e: any) {
      message.error(`detail failed: ${e?.message ?? e}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const onClose = (row: Incident) => {
    confirm({
      title: `手动关闭 incident #${row.id}？`,
      icon: <ExclamationCircleOutlined />,
      content: 'incident 状态将立即变为 CLOSED，此后即使有匹配事件也不会再合并到此 incident。',
      onOk: async () => {
        try {
          await closeIncident(row.id);
          message.success('已关闭');
          refresh();
        } catch (e: any) {
          message.error(`close failed: ${e?.message ?? e}`);
        }
      },
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string, r: Incident) => (
        <a onClick={() => openDetail(r.id)} style={{ fontWeight: 500 }}>
          {v || `incident-${r.id}`}
        </a>
      ),
    },
    {
      title: '维度',
      dataIndex: 'incident_key',
      ellipsis: true,
      width: 280,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 100,
      render: (v: number) => {
        const s = SEVERITY_LABEL[v] ?? { text: `S${v}`, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '事件数',
      dataIndex: 'event_count',
      width: 90,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: number, r: Incident) => {
        const s = STATUS_LABEL[v] ?? { text: `S${v}`, color: 'default' };
        return (
          <Space size={4}>
            <Tag color={s.color}>{s.text}</Tag>
            {r.storm_fired === 1 && <Tag color='volcano'>STORM</Tag>}
          </Space>
        );
      },
    },
    {
      title: '首次 → 最末',
      width: 180,
      render: (_v: any, r: Incident) => (
        <Space size={2} direction='vertical'>
          <span style={{ fontSize: 12 }}>{moment.unix(r.first_event_at).format('MM-DD HH:mm:ss')}</span>
          <span style={{ fontSize: 12, color: '#999' }}>→ {moment.unix(r.last_event_at).format('MM-DD HH:mm:ss')}</span>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (_v: any, r: Incident) => (
        <Space>
          <a onClick={() => openDetail(r.id)}>详情</a>
          {r.status === 0 && (
            <a style={{ color: '#ff4d4f' }} onClick={() => onClose(r)}>
              关闭
            </a>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageLayout title='Incident 列表' showBack={false}>
      <div style={{ padding: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
          <Button
            type={statusFilter === undefined ? 'primary' : 'default'}
            onClick={() => {
              setStatusFilter(undefined);
              setPage(1);
            }}
          >
            全部 ({total})
          </Button>
          <Button
            type={statusFilter === 0 ? 'primary' : 'default'}
            danger={statusFilter === 0}
            onClick={() => {
              setStatusFilter(0);
              setPage(1);
            }}
          >
            进行中
          </Button>
          <Button
            type={statusFilter === 1 ? 'primary' : 'default'}
            onClick={() => {
              setStatusFilter(1);
              setPage(1);
            }}
          >
            已恢复
          </Button>
          <Button
            type={statusFilter === 2 ? 'primary' : 'default'}
            onClick={() => {
              setStatusFilter(2);
              setPage(1);
            }}
          >
            已关闭
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
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps || 20);
            },
          }}
        />

        <Drawer title={detail ? `Incident #${detail.id}` : 'Incident 详情'} width={720} visible={detail !== null} onClose={() => setDetail(null)} destroyOnClose>
          {detail && (
            <>
              <Descriptions column={1} size='small' bordered>
                <Descriptions.Item label='标题'>{detail.title || '—'}</Descriptions.Item>
                <Descriptions.Item label='摘要'>{detail.summary || '—'}</Descriptions.Item>
                <Descriptions.Item label='维度键'>
                  <code>{detail.incident_key}</code>
                </Descriptions.Item>
                <Descriptions.Item label='维度值'>
                  <pre style={{ margin: 0, fontSize: 12 }}>{detail.dimension_values || '{}'}</pre>
                </Descriptions.Item>
                <Descriptions.Item label='严重度'>{SEVERITY_LABEL[detail.severity]?.text ?? detail.severity}</Descriptions.Item>
                <Descriptions.Item label='状态'>{STATUS_LABEL[detail.status]?.text ?? detail.status}</Descriptions.Item>
                <Descriptions.Item label='事件数'>{detail.event_count}</Descriptions.Item>
                <Descriptions.Item label='首次事件'>{moment.unix(detail.first_event_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label='最末事件'>{moment.unix(detail.last_event_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                {detail.resolved_at > 0 && <Descriptions.Item label='恢复时间'>{moment.unix(detail.resolved_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>}
                {detail.closed_at > 0 && <Descriptions.Item label='关闭时间'>{moment.unix(detail.closed_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>}
              </Descriptions>

              <h4 style={{ marginTop: 16 }}>关联事件 ({detail.events?.length ?? 0})</h4>
              <Table
                rowKey='id'
                size='small'
                dataSource={detail.events ?? []}
                pagination={false}
                columns={[
                  { title: 'event_id', dataIndex: 'event_id', width: 90 },
                  {
                    title: 'hash',
                    dataIndex: 'event_hash',
                    ellipsis: true,
                    render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
                  },
                  {
                    title: '已恢复',
                    dataIndex: 'is_recovered',
                    width: 80,
                    render: (v: number) => (v === 1 ? <Tag color='green'>是</Tag> : <Tag color='red'>否</Tag>),
                  },
                  {
                    title: '合并时间',
                    dataIndex: 'merged_at',
                    width: 160,
                    render: (v: number) => moment.unix(v).format('YYYY-MM-DD HH:mm:ss'),
                  },
                ]}
              />
            </>
          )}
        </Drawer>
      </div>
    </PageLayout>
  );
};

export default Page;
