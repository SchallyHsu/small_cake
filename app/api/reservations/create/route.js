import { ok } from '../../../../lib/api';
import { pkuFetch } from '../../../../lib/pku';
import { withSession } from '../../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function POST(request) {
  return withSession(request, async (session) => {
    const { resourceId, date, period } = await request.json();
    if (!resourceId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !period) throw new Error('预约参数不完整');
    const form = {
      resource_id: String(resourceId),
      data: JSON.stringify([{ date: String(date), period: Number(period), sub_resource_id: 0 }]),
    };
    const result = await pkuFetch(session.jar, 'https://wproc.pku.edu.cn/site/reservation/launch', { method: 'POST', form });
    if (result.status !== 200) throw new Error(`预约失败，状态码 ${result.status}`);
    const json = JSON.parse(result.text);
    if (json?.m !== '操作成功') throw new Error(json?.m || '预约失败');
    return ok({ reservation: {
      id: String(json?.d?.id ?? ''),
      hallAppointmentDataId: String(json?.d?.hall_appointment_data_id ?? ''),
    }});
  });
}
