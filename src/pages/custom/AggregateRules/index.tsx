/*
 * Aggregate rules CRUD page.
 *
 * Layout:
 *   PageLayout
 *     ├─ Toolbar:  [+ New rule] [search box] [refresh]
 *     └─ Table:    name / dimensions / window / storm / disabled / actions
 *
 * Edit happens in a Modal — we deliberately don't push routes for create/
 * edit (unlike the upstream Shield page) because:
 *   1. Aggregate rules are simple — 8-ish fields fit on one screen.
 *   2. Operators usually want to tweak one rule then look at the list, so
 *      keeping the list as the back-stop avoids a navigation tax.
 *   3. Less router glue to maintain through future fe upstream merges.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Switch, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import _ from 'lodash';
import moment from 'moment';

import PageLayout from '@/components/pageLayout';
import { AggregateRule, listAggregateRules, deleteAggregateRule, updateAggregateRule, createAggregateRule } from '@/services/custom';
import RuleForm from './RuleForm';

const { Search } = Input;
const { confirm } = Modal;

const Page: React.FC = () => {
  const [rows, setRows] = useState<AggregateRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AggregateRule | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    setLoading(true);
    listAggregateRules()
      .then((res: any) => setRows(res?.dat?.list ?? []))
      .catch((e) => message.error(`load failed: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  // Cheap client-side filter — list is small (config table) so we don't
  // need server-side search just to support a name substring query.
  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.note?.toLowerCase().includes(q) || r.dimensions?.some((d) => d.toLowerCase().includes(q)));
  }, [rows, query]);

  const onToggle = async (row: AggregateRule, enabled: boolean) => {
    try {
      await updateAggregateRule(row.id, {
        name: row.name,
        note: row.note,
        dimensions: row.dimensions,
        window_sec: row.window_sec,
        filters: JSON.stringify(row.filters ?? []),
        datasource_ids: row.datasource_ids ?? [],
        severities: row.severities ?? [],
        storm_threshold: row.storm_threshold,
        storm_window_sec: row.storm_window_sec,
        disabled: enabled ? 0 : 1,
        priority: row.priority,
        group_id: row.group_id,
      });
      message.success(enabled ? '已启用' : '已停用');
      refresh();
    } catch (e: any) {
      message.error(`toggle failed: ${e?.message ?? e}`);
    }
  };

  const onDelete = (row: AggregateRule) => {
    confirm({
      title: `删除聚合规则 #${row.id}「${row.name}」？`,
      icon: <ExclamationCircleOutlined />,
      content: '删除后该规则会立即失效，5 秒内全集群同步。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteAggregateRule(row.id);
          message.success('已删除');
          refresh();
        } catch (e: any) {
          message.error(`delete failed: ${e?.message ?? e}`);
        }
      },
    });
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
      render: (v: string, r: AggregateRule) => (
        <a onClick={() => setEditing(r)} style={{ fontWeight: 500 }}>
          {v}
        </a>
      ),
    },
    {
      title: '聚合维度',
      dataIndex: 'dimensions',
      render: (v: string[]) => (v?.length ? v.map((d) => <Tag key={d}>{d}</Tag>) : <span style={{ color: '#999' }}>—</span>),
    },
    {
      title: '窗口 (秒)',
      dataIndex: 'window_sec',
      width: 100,
    },
    {
      title: '风暴阈值',
      dataIndex: 'storm_threshold',
      width: 120,
      render: (v: number, r: AggregateRule) =>
        v > 0 ? (
          <Tooltip title={`${r.storm_window_sec}s 内 ${v} 条触发风暴通知`}>
            <Tag color='volcano'>{v}</Tag>
          </Tooltip>
        ) : (
          <span style={{ color: '#999' }}>—</span>
        ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
    },
    {
      title: '启用',
      dataIndex: 'disabled',
      width: 80,
      render: (v: number, r: AggregateRule) => <Switch checked={v === 0} onChange={(c) => onToggle(r, c)} />,
    },
    {
      title: '更新人 / 时间',
      width: 200,
      render: (_v: any, r: AggregateRule) => (
        <Space size={4} direction='vertical'>
          <span>{r.update_by}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{moment.unix(r.update_at).format('YYYY-MM-DD HH:mm:ss')}</span>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (_v: any, r: AggregateRule) => (
        <Space>
          <a onClick={() => setEditing(r)}>编辑</a>
          <a style={{ color: '#ff4d4f' }} onClick={() => onDelete(r)}>
            删除
          </a>
        </Space>
      ),
    },
  ];

  return (
    <PageLayout title='告警聚合规则' showBack={false}>
      <div style={{ padding: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            新建聚合规则
          </Button>
          <Search placeholder='搜索名称 / 备注 / 维度' style={{ width: 320 }} allowClear onSearch={setQuery} />
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
        </Space>

        <Table rowKey='id' loading={loading} dataSource={filtered} columns={columns} size='small' pagination={{ pageSize: 20, showSizeChanger: true }} />

        {creating && (
          <RuleForm
            mode='create'
            onClose={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              refresh();
            }}
          />
        )}

        {editing && (
          <RuleForm
            mode='edit'
            initial={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </div>
    </PageLayout>
  );
};

export default Page;
