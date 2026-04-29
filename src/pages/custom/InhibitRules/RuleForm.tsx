/*
 * Inhibit rule form. The hard fields are source_match and target_match —
 * arrays of TagFilter shaped like:
 *   [{key: 'alertname', op: '==', func: '==', value: 'HostDown'}, ...]
 *
 * For now we expose them as JSON Textareas with parse-on-save validation.
 * A future iteration can swap in a structured tag-filter builder; the
 * payload stays the same JSON either way, so that change wouldn't touch
 * the API.
 */
import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Modal, Select, message } from 'antd';

import { InhibitRule, InhibitRuleWriteReq, createInhibitRule, updateInhibitRule } from '@/services/custom';

interface Props {
  mode: 'create' | 'edit';
  initial?: InhibitRule;
  onClose: () => void;
  onSaved: () => void;
}

// Default empty source/target shows operators the expected shape on create.
const PLACEHOLDER_MATCH = `[
  {"key": "alertname", "op": "==", "func": "==", "value": "HostDown"}
]`;

const RuleForm: React.FC<Props> = ({ mode, initial, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        note: initial.note,
        source_match: JSON.stringify(initial.source_match ?? [], null, 2),
        target_match: JSON.stringify(initial.target_match ?? [], null, 2),
        equal_labels: initial.equal_labels ?? [],
        group_id: initial.group_id,
      });
    } else {
      form.setFieldsValue({
        group_id: 0,
        equal_labels: [],
        source_match: '',
        target_match: '',
      });
    }
  }, [initial, form]);

  const submit = async () => {
    let v: any;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }

    // Backend wants raw JSON string; we re-stringify (no whitespace) so audit
    // diffs don't show pretty-print noise as real changes.
    const parseAndCompact = (raw: string, label: string): string | null => {
      const trimmed = (raw ?? '').trim();
      if (!trimmed) {
        message.error(`${label} 不能为空`);
        return null;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          message.error(`${label} 必须是非空 JSON 数组`);
          return null;
        }
        return JSON.stringify(parsed);
      } catch (e: any) {
        message.error(`${label} 不是合法 JSON: ${e?.message ?? e}`);
        return null;
      }
    };

    const sourceMatch = parseAndCompact(v.source_match, 'source_match');
    if (!sourceMatch) return;
    const targetMatch = parseAndCompact(v.target_match, 'target_match');
    if (!targetMatch) return;

    const payload: InhibitRuleWriteReq = {
      name: v.name,
      note: v.note ?? '',
      source_match: sourceMatch,
      target_match: targetMatch,
      equal_labels: v.equal_labels ?? [],
      datasource_ids: [],
      disabled: initial?.disabled ?? 0,
      group_id: v.group_id ?? 0,
    };

    try {
      if (isEdit) {
        await updateInhibitRule(initial!.id, payload);
        message.success('已保存');
      } else {
        await createInhibitRule(payload);
        message.success('已创建');
      }
      onSaved();
    } catch (e: any) {
      message.error(`保存失败: ${e?.message ?? e}`);
    }
  };

  return (
    <Modal title={isEdit ? `编辑抑制规则 #${initial?.id}` : '新建抑制规则'} visible onCancel={onClose} onOk={submit} okText='保存' cancelText='取消' width={720} destroyOnClose>
      <Form form={form} layout='vertical' preserve={false}>
        <Form.Item label='名称' name='name' rules={[{ required: true, message: '必填' }]} tooltip='给规则起个能让 oncall 一眼看懂的名字'>
          <Input placeholder='例如：HostDown 抑制其上服务告警' maxLength={255} />
        </Form.Item>

        <Form.Item label='备注' name='note'>
          <Input.TextArea rows={2} maxLength={1024} />
        </Form.Item>

        <Form.Item
          label='Source Match (根因匹配)'
          name='source_match'
          rules={[{ required: true, message: '必填' }]}
          tooltip='当事件命中这些过滤条件，被视为根因告警，进入活跃源索引'
          extra='[{"key":"标签名","op":"==","func":"==","value":"标签值"}, ...]'
        >
          <Input.TextArea rows={4} placeholder={PLACEHOLDER_MATCH} spellCheck={false} />
        </Form.Item>

        <Form.Item
          label='Target Match (衍生匹配)'
          name='target_match'
          rules={[{ required: true, message: '必填' }]}
          tooltip='当事件命中这些过滤条件，进入抑制候选；若与某个活跃源 equal_labels 一致则被抑制'
          extra='[{"key":"category","op":"==","func":"==","value":"service"}]'
        >
          <Input.TextArea rows={4} placeholder='[{"key":"category","op":"==","func":"==","value":"service"}]' spellCheck={false} />
        </Form.Item>

        <Form.Item
          label='Equal Labels'
          name='equal_labels'
          tooltip='source 和 target 必须在这些 label key 上有相同值才生效（如 ["host"] 表示同主机）'
          extra='留空 = 不要求等值；危险，会让一个根因抑制全部目标'
        >
          <Select mode='tags' placeholder='输入 label key，回车确认。例：host、service、instance' tokenSeparators={[',', ' ']} />
        </Form.Item>

        <Form.Item label='业务组 ID' name='group_id' tooltip='0 = 全局；非 0 = 该业务组专属规则'>
          <InputNumber min={0} style={{ width: 200 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RuleForm;
