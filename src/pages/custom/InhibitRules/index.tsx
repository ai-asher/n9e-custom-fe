/*
 * Inhibit rules CRUD page.
 *
 * Mirrors AggregateRules layout — a tab in '告警 → 规则管理'. The form is
 * trickier than aggregate's because source_match / target_match are JSON
 * arrays of TagFilter, not simple lists; we expose them as JSON Textareas
 * with parse-on-save validation. Equal labels stays as a tag-input list
 * since they are just bare label keys.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Switch, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import _ from 'lodash';
import moment from 'moment';

import PageLayout from '@/components/pageLayout';
import { InhibitRule, listInhibitRules, deleteInhibitRule, updateInhibitRule } from '@/services/custom';
import RuleForm from './RuleForm';

const { Search } = Input;
const { confirm } = Modal;

const Page: React.FC = () => {
  const [rows, setRows] = useState<InhibitRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<InhibitRule | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    setLoading(true);
    listInhibitRules()
      .then((res: any) => setRows(res?.dat?.list ?? []))
      .catch((e) => message.error(`load failed: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.note?.toLowerCase().includes(q) || r.equal_labels?.some((d) => d.toLowerCase().includes(q)));
  }, [rows, query]);

  const onToggle = async (row: InhibitRule, enabled: boolean) => {
    try {
      await updateInhibitRule(row.id, {
        name: row.name,
        note: row.note,
        source_match: JSON.stringify(row.source_match ?? []),
        target_match: JSON.stringify(row.target_match ?? []),
        equal_labels: row.equal_labels ?? [],
        datasource_ids: row.datasource_ids ?? [],
        disabled: enabled ? 0 : 1,
        group_id: row.group_id,
      });
      message.success(enabled ? '已启用' : '已停用');
      refresh();
    } catch (e: any) {
      message.error(`toggle failed: ${e?.message ?? e}`);
    }
  };

  const onDelete = (row: InhibitRule) => {
    confirm({
      title: `删除抑制规则 #${row.id}「${row.name}」？`,
      icon: <ExclamationCircleOutlined />,
      content: '删除后该规则会立即失效，5 秒内全集群同步。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteInhibitRule(row.id);
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
      render: (v: string, r: InhibitRule) => (
        <a onClick={() => setEditing(r)} style={{ fontWeight: 500 }}>
          {v}
        </a>
      ),
    },
    {
      title: '备注',
      dataIndex: 'note',
      ellipsis: true,
    },
    {
      title: 'Equal Labels',
      dataIndex: 'equal_labels',
      width: 240,
      render: (v: string[]) => (v?.length ? v.map((d) => <Tag key={d}>{d}</Tag>) : <span style={{ color: '#999' }}>—</span>),
    },
    {
      title: '启用',
      dataIndex: 'disabled',
      width: 80,
      render: (v: number, r: InhibitRule) => <Switch checked={v === 0} onChange={(c) => onToggle(r, c)} />,
    },
    {
      title: '更新人 / 时间',
      width: 200,
      render: (_v: any, r: InhibitRule) => (
        <Space size={4} direction='vertical'>
          <span>{r.update_by}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{moment.unix(r.update_at).format('YYYY-MM-DD HH:mm:ss')}</span>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (_v: any, r: InhibitRule) => (
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
    <PageLayout title='告警抑制规则' showBack={false}>
      <div style={{ padding: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            新建抑制规则
          </Button>
          <Search placeholder='搜索名称 / 备注 / equal label' style={{ width: 320 }} allowClear onSearch={setQuery} />
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
