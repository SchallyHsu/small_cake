import { ok } from '../../../../lib/api';
import { isWprocOk, parseJson, pkuFetch } from '../../../../lib/pku';
import { withSession } from '../../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function GET(request) {
  return withSession(request, async (session) => {
    const q = new URL(request.url).searchParams;
    const resourceId = q.get('resourceId');
    const startTime = q.get('startTime');
    if (!resourceId || !startTime) throw new Error('临时码参数不完整');
    const url = new URL('https://wproc.pku.edu.cn/site/reservation/get-sign-qrcode');
    url.search = new URLSearchParams({ type: '1', resource_id: resourceId, text: startTime });
    const json = parseJson(await pkuFetch(session.jar, url), '临时码获取');
    if (!isWprocOk(json)) throw new Error(json?.m || '临时码获取失败');
    return ok({ code: String(json?.d?.code || '') });
  });
}
