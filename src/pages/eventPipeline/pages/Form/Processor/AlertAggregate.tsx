/*
 * AlertAggregate processor config panel.
 *
 * The alert_aggregate processor takes a single config field — `mode` —
 * because all the heavy lifting (dimensions, window, storm threshold) is
 * defined in custom_aggregate_rule rows, NOT here. The processor merely
 * decides what to do with the event when a rule matches:
 *
 *   drop_merged (default)
 *     - first event of an incident: pass through (let it fire a notice)
 *     - subsequent events merged into the same incident: dropped
 *   annotate
 *     - all events pass through with an `incident_id` tag attached, so a
 *       downstream sender can branch on it
 *
 * Operators wire the processor onto a NotifyRule's pipeline once; the
 * actual aggregation behavior is controlled by editing rules in the
 * 聚合规则 page (which hot-reloads in 5s without reconfiguring this node).
 */
import React from 'react';
import { Alert, Form, Radio } from 'antd';
import { FormListFieldData } from 'antd/lib/form/FormList';
import _ from 'lodash';

interface Props {
  field: FormListFieldData;
  namePath: (string | number)[];
}

export default function AlertAggregate(props: Props) {
  const { field, namePath = [] } = props;
  const resetField = _.omit(field, ['name', 'key']);

  return (
    <>
      <Alert
        type='info'
        showIcon
        style={{ marginBottom: 16 }}
        message='聚合行为由聚合规则定义'
        description={<>维度、窗口、风暴阈值等参数请在「告警 → 规则管理 → 聚合规则」页面配置； 此节点只决定命中规则后如何处理事件。</>}
      />
      <Form.Item {...resetField} label='处理模式' name={[...namePath, 'mode']} rules={[{ required: true, message: '必填' }]} initialValue='drop_merged'>
        <Radio.Group>
          <Radio.Button value='drop_merged'>合并丢弃 (默认)</Radio.Button>
          <Radio.Button value='annotate'>仅打标</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item label=' ' colon={false}>
        <div style={{ color: '#999', fontSize: 12 }}>
          <div>
            <b>合并丢弃</b>：首条事件正常通知，后续合并到同一 incident 的事件被丢弃。
          </div>
          <div>
            <b>仅打标</b>：所有事件穿透，但被合并的事件 TagsMap 上挂 <code>incident_id</code> 标签， 下游 sender 可自行判定是否发送。
          </div>
        </div>
      </Form.Item>
    </>
  );
}
