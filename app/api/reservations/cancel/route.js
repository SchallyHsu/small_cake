import { ok } from '../../../../lib/api';
import { pkuFetch } from '../../../../lib/pku';
import { withSession } from '../../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function POST(request) {
  return withSession(request, async (session) => {
    const { appointmentId, hallAppointmentDataId } = await request.json();
    if (!appointmentId || !hallAppointmentDataId) throw new Error('取消预约参数不完整');
    const result = await pkuFetch(session.jar, 'https://wproc.pku.edu.cn/site/reservation/single-time-cancel', {
      method: 'POST',
      form: { appointment_id: String(appointmentId), 'data_id[0]': String(hallAppointmentDataId) },
    });
    if (result.status !== 200) throw new Error(`取消预约失败，状态码 ${result.status}`);
    const json = JSON.parse(result.text);
    if (json?.m !== '操作成功') throw new Error(json?.m || '取消预约失败');
    return ok();
  });
}
