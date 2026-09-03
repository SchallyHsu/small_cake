import { ok } from '../../../../lib/api';
import { isWprocOk, parseJson, pkuFetch } from '../../../../lib/pku';
import { withSession } from '../../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function GET(request) {
  return withSession(request, async (session) => {
    const url = new URL('https://wproc.pku.edu.cn/site/reservation/my-list-time');
    url.search = new URLSearchParams({ p: '1', page_size: '0', status: '2', sort_time: 'true', sort: 'asc' });
    const json = parseJson(await pkuFetch(session.jar, url), '预约列表');
    if (!isWprocOk(json)) throw new Error(json?.m || '预约列表获取失败');
    const reservations = (json?.d?.data || []).map((x) => ({
      id: String(x?.id ?? ''),
      hallAppointmentDataId: String(x?.hall_appointment_data_id ?? ''),
      appointmentTime: String(x?.appointment_tim || '').trim(),
      resourceName: String(x?.resource_name || ''),
    }));
    return ok({ reservations });
  });
}
