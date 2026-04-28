/*
 * Aggregate rule create/edit form, rendered as an Antd Modal.
 *
 * Field-level decisions (worth recording — they were not all obvious):
 *
 *   dimensions    Select with mode='tags' so operators type freely; auto-
 *                 dedup. Empty submit blocked client-side because the
 *                 backend already validates this and we want a friendlier
 *                 error than "name is required" surfaced from the API.
 *   window_sec    Number input, range 30..86400 (30s to 24h). Outside that
 *                 range is almost always a typo; we let the value through
 *                 but warn — backend will accept anything > 0.
 *   filters       Free-form JSON Textarea. Auto-prettified on focus loss.
 *                 An empty value submits as "[]" (no filter), matching the
 *                 backend's "len(filters)==0 means match-all" semantics.
 *   storm_*       Threshold=0 disables storm detection; window only takes
 *                 effect when threshold>0.
 */
import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Modal, Select, message } from 'antd';

import { AggregateRule, AggregateRuleWriteReq, createAggregateRule, updateAggregateRule } from '@/services/custom';

interface Props {
  mode: 'create' | 'edit';
  initial?: AggregateRule;
  onClose: () => void;
  onSaved: () => void;
}

const RuleForm: React.FC<Props> = ({ mode, initial, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        note: initial.note,
        dimensions: initial.dimensions ?? [],
        window_sec: initial.window_sec,
        filters: initial.filters && initial.filters.length ? JSON.stringify(initial.filters, null, 2) : '',
        storm_threshold: initial.storm_threshold,
        storm_window_sec: initial.storm_window_sec || 60,
        priority: initial.priority,
        group_id: initial.group_id,
      });
    } else {
      form.setFieldsValue({
        window_sec: 300,
        storm_threshold: 0,
        storm_window_sec: 60,
        priority: 0,
        group_id: 0,
      });
    }
  }, [initial, form]);

  const submit = async () => {
    let v: any;
    try {
      v = await form.validateFields();
    } catch {
      return; // antd has shown the field errors already
    }

    // The backend wants `filters` as a raw JSON string (it stores the bytes
    // verbatim). Empty textarea → "[]" sentinel.
    let filtersStr = (v.filters ?? '').trim();
    if (filtersStr === '') {
      filtersStr = '[]';
    } else {
      try {
        // Re-stringify so we never persist whitespace junk that breaks
        // string equality in audit diffs.
        filtersStr = JSON.stringify(JSON.parse(filtersStr));
      } catch (e: any) {
        message.error(`filters 不是合法 JSON: ${e?.message ?? e}`);
        return;
      }
    }

    const payload: AggregateRuleWriteReq = {
      name: v.name,
      note: v.note ?? '',
      dimensions: v.dimensions,
      window_sec: v.window_sec,
      filters: filtersStr,
      datasource_ids: [],
      severities: [],
      storm_threshold: v.storm_threshold ?? 0,
      storm_window_sec: v.storm_window_sec ?? 60,
      priority: v.priority ?? 0,
      group_id: v.group_id ?? 0,
      disabled: initial?.disabled ?? 0,
    };

    try {
      if (isEdit) {
        await updateAggregateRule(initial!.id, payload);
        message.success('已保存');
      } else {
        await createAggregateRule(payload);
        message.success('已创建');
      }
      onSaved();
    } catch (e: any) {
      message.error(`保存失败: ${e?.message ?? e}`);
    }
  };

  return (
    <Modal title={isEdit ? `编辑聚合规则 #${initial?.id}` : '新建聚合规则'} open onCancel={onClose} onOk={submit} okText='保存' cancelText='取消' width={680} destroyOnClose>
      <Form form={form} layout='vertical' preserve={false}>
        <Form.Item label='名称' name='name' rules={[{ required: true, message: '必填' }]} tooltip='给规则起个能让 oncall 一眼看懂的名字'>
          <Input placeholder='例如：service+cluster 5 分钟合并' maxLength={255} />
        </Form.Item>

        <Form.Item label='备注' name='note'>
          <Input.TextArea rows={2} maxLength={1024} placeholder='可选：描述这条规则解决什么问题' />
        </Form.Item>

        <Form.Item
          label='聚合维度'
          name='dimensions'
          rules={[{ required: true, message: '至少填一个标签键' }]}
          tooltip='事件 TagsMap 中以下标签值都相同的，会被合并到同一个 incident'
        >
          <Select mode='tags' placeholder='输入标签键，回车确认。例：service、cluster、host' tokenSeparators={[',', ' ']} />
        </Form.Item>

        <Form.Item label='聚合窗口（秒）' name='window_sec' rules={[{ required: true, message: '必填' }]} tooltip='last_event_at 滚动窗口；窗口内不再有事件 → 自动结束'>
          <InputNumber min={30} max={86400} style={{ width: 200 }} />
        </Form.Item>

        <Form.Item label='Tag 过滤（JSON 数组）' name='filters' tooltip='留空 = 不过滤；非空必须是 [{"key","op","value"}, ...] 这种 JSON 数组'>
          <Input.TextArea rows={3} placeholder='留空表示不过滤；示例：[{"key":"env","op":"==","func":"==","value":"prod"}]' spellCheck={false} />
        </Form.Item>

        <Form.Item label='风暴阈值' name='storm_threshold' tooltip='0 = 关闭风暴检测；> 0 = 单 incident 在风暴窗口内累计 N 条事件后触发风暴通知'>
          <InputNumber min={0} style={{ width: 200 }} />
        </Form.Item>

        <Form.Item label='风暴窗口（秒）' name='storm_window_sec' tooltip='风暴检测的滑动时间窗口'>
          <InputNumber min={10} style={{ width: 200 }} />
        </Form.Item>

        <Form.Item label='优先级' name='priority' tooltip='事件命中多条规则时，priority 数值大者胜出；相同则取 id 较小的'>
          <InputNumber style={{ width: 200 }} />
        </Form.Item>

        <Form.Item label='业务组 ID' name='group_id' tooltip='0 表示全局，非 0 表示该业务组专属规则'>
          <InputNumber min={0} style={{ width: 200 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RuleForm;
