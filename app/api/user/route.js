import { ok } from '../../../lib/api';
import { isWprocOk, parseJson, pkuFetch } from '../../../lib/pku';
import { withSession } from '../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function GET(request) {
  return withSession(request, async (session) => {
    const url = new URL('https://wproc.pku.edu.cn/site/reservation/get-sign-qrcode');
    url.search = new URLSearchParams({ type: '1', resource_id: '7', text: '22:00' });
    const json = parseJson(await pkuFetch(session.jar, url), '用户信息获取');
    if (!isWprocOk(json)) throw new Error(json?.m || '用户信息获取失败');
    const lines = String(json?.d?.name || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    return ok({ user: { name: lines[0] || session.username, studentId: lines[1] || '', college: lines[2] || '' } });
  });
}
