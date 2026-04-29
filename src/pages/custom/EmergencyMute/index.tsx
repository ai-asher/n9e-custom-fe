/*
 * Emergency mute — singleton page.
 *
 * Layout:
 *   - Big status banner: green "OFF" / red "ON" with countdown
 *   - Toggle button (with required reason input on enable)
 *   - Audit hint: shows last update_by and update_at
 *
 * Why a single page rather than CRUD: there is exactly one row (id=1) by
 * design — the global mute is a toggle, not a list of toggles. Modeling
 * it as CRUD would let operators create id=2 by accident and then wonder
 * why it doesn't take effect.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Space, Statistic, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import moment from 'moment';

import PageLayout from '@/components/pageLayout';
import { EmergencyMute, getEmergencyMute, putEmergencyMute } from '@/services/custom';

const { Countdown } = Statistic;
const { confirm } = Modal;

const Page: React.FC = () => {
  const [data, setData] = useState<EmergencyMute | null>(null);
  const [loading, setLoading] = useState(false);
  const [enableModal, setEnableModal] = useState(false);
  const [form] = Form.useForm();

  const refresh = () => {
    setLoading(true);
    getEmergencyMute()
      .then((res: any) => setData(res?.dat ?? null))
      .catch((e) => message.error(`load failed: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const isOn = data?.enabled === 1;
  // Coerce expire_at to "still in the future" before treating as active —
  // the backend already strips expired mutes, but we re-check here so a
  // stale page after browser sleep doesn't wrongly show "still muted".
  const isActive = isOn && (data!.expire_at === 0 || data!.expire_at > Math.floor(Date.now() / 1000));

  const submitEnable = async () => {
    let v: any;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    // expire_at: empty input = 0 = no expiry. The backend already accepts this.
    const expireAt = v.expire_minutes && v.expire_minutes > 0 ? Math.floor(Date.now() / 1000) + v.expire_minutes * 60 : 0;
    try {
      await putEmergencyMute({
        enabled: 1,
        reason: v.reason,
        expire_at: expireAt,
        datasource_ids: [],
        group_ids: [],
      });
      message.success('应急屏蔽已开启');
      setEnableModal(false);
      form.resetFields();
      refresh();
    } catch (e: any) {
      message.error(`开启失败: ${e?.message ?? e}`);
    }
  };

  const onDisable = () => {
    confirm({
      title: '关闭应急屏蔽？',
      icon: <ExclamationCircleOutlined />,
      content: '所有告警将立即恢复正常通知（最迟 1 秒生效）。',
      onOk: async () => {
        try {
          await putEmergencyMute({ enabled: 0 });
          message.success('应急屏蔽已关闭');
          refresh();
        } catch (e: any) {
          message.error(`关闭失败: ${e?.message ?? e}`);
        }
      },
    });
  };

  return (
    <PageLayout title='全局应急屏蔽' showBack={false}>
      <div style={{ padding: 16 }}>
        <Alert
          type='warning'
          showIcon
          message='应急屏蔽会暂停整个平台的告警通知'
          description='大型故障 / 维护窗口 / 演练时使用。开启需要填写原因，建议设置自动失效时间防止忘关；可选永不过期。'
          style={{ marginBottom: 16 }}
        />

        <Card loading={loading}>
          {isActive ? (
            <Space direction='vertical' size='large' style={{ width: '100%' }}>
              <Alert type='error' showIcon message={<span style={{ fontSize: 18, fontWeight: 600 }}>应急屏蔽已开启 - 全平台告警暂停中</span>} />
              <Space size={48} wrap>
                <Statistic title='开启原因' value={data!.reason || '—'} valueStyle={{ fontSize: 16 }} />
                <Statistic title='开启人 / 时间' value={`${data!.update_by} · ${moment.unix(data!.update_at).format('YYYY-MM-DD HH:mm:ss')}`} valueStyle={{ fontSize: 14 }} />
                {data!.expire_at > 0 ? (
                  <Countdown title='剩余时间' value={data!.expire_at * 1000} onFinish={refresh} />
                ) : (
                  <Statistic title='过期时间' value='永不过期' valueStyle={{ color: '#ff4d4f' }} />
                )}
              </Space>
              <Button danger size='large' onClick={onDisable}>
                关闭应急屏蔽
              </Button>
            </Space>
          ) : (
            <Space direction='vertical' size='large' style={{ width: '100%' }}>
              <Alert type='success' showIcon message='应急屏蔽未开启 - 告警通知正常运行' />
              {data && data.update_at > 0 && (
                <div style={{ color: '#999', fontSize: 13 }}>
                  上次操作：{data.update_by} · {moment.unix(data.update_at).format('YYYY-MM-DD HH:mm:ss')}
                  {data.reason ? ` · 原因：${data.reason}` : ''}
                </div>
              )}
              <Button type='primary' danger size='large' onClick={() => setEnableModal(true)}>
                开启应急屏蔽
              </Button>
            </Space>
          )}
        </Card>

        <Modal
          title='开启全局应急屏蔽'
          visible={enableModal}
          onCancel={() => {
            setEnableModal(false);
            form.resetFields();
          }}
          onOk={submitEnable}
          okText='确认开启'
          okButtonProps={{ danger: true }}
          cancelText='取消'
          width={520}
          destroyOnClose
        >
          <Alert type='warning' showIcon message='开启后所有告警通知将被静默' description='请确认你确实想暂停全平台的告警。' style={{ marginBottom: 16 }} />
          <Form form={form} layout='vertical' preserve={false}>
            <Form.Item label='原因（必填）' name='reason' rules={[{ required: true, message: '必须填写原因，用于事后审计' }]}>
              <Input.TextArea rows={3} maxLength={512} placeholder='例：机房割接维护 / 双十一演练 / DB 大批量迁移' />
            </Form.Item>
            <Form.Item label='自动失效（分钟）' name='expire_minutes' tooltip='留空 = 永不过期；建议填写避免忘记关闭'>
              <InputNumber min={1} max={7 * 24 * 60} step={30} style={{ width: 200 }} placeholder='例：60 = 1 小时后自动失效' />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </PageLayout>
  );
};

export default Page;
