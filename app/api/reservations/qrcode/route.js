import { ok } from '../../../../lib/api';
import { isWprocOk, parseJson, pkuFetch } from '../../../../lib/pku';
import { withSession } from '../../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function GET(request) {
  return withSession(request, async (session) => {
    const q = new URL(request.url).searchParams;
    const id = q.get('id');
    const dataId = q.get('dataId');
    if (!id || !dataId) throw new Error('二维码参数不完整');
    const url = new URL('https://wproc.pku.edu.cn/site/reservation/get-sign-qrcode');
    url.search = new URLSearchParams({ type: '0', id, hall_appointment_data_id: dataId });
    const json = parseJson(await pkuFetch(session.jar, url), '二维码获取');
    if (!isWprocOk(json)) throw new Error(json?.m || '二维码获取失败');
    return ok({ code: String(json?.d?.code || '') });
  });
}
