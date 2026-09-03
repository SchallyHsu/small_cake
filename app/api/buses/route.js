import { ok } from '../../../lib/api';
import { isWprocOk, normalizeTime, parseJson, pkuFetch } from '../../../lib/pku';
import { withSession } from '../../../lib/wproc-route';

export const runtime = 'nodejs';

export async function GET(request) {
  return withSession(request, async (session) => {
    const date = new URL(request.url).searchParams.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式不正确');

    const url = new URL('https://wproc.pku.edu.cn/site/reservation/list-page');
    url.search = new URLSearchParams({ hall_id: '1', time: date, p: '1', page_size: '0' });
    const json = parseJson(await pkuFetch(session.jar, url), '班车查询');
    if (!isWprocOk(json)) throw new Error(json?.m || '班车查询失败');

    const buses = [];
    const seen = new Set();
    for (const bus of json?.d?.list || []) {
      const table = bus?.table || {};
      for (const slots of Object.values(table)) {
        if (!Array.isArray(slots)) continue;
        for (const slot of slots) {
          const remaining = Number(slot?.row?.margin || 0);
          if (remaining <= 0) continue;
          const item = {
            routeName: String(bus?.name || ''),
            resourceId: String(bus?.id ?? ''),
            date: String(slot?.abscissa || date).trim(),
            time: normalizeTime(slot?.yaxis),
            period: String(slot?.time_id ?? ''),
            remaining,
            status: slot?.row?.status,
          };
          const key = `${item.date}_${item.time}_${item.resourceId}_${item.period}`;
          if (!seen.has(key)) { seen.add(key); buses.push(item); }
        }
      }
    }
    buses.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return ok({ buses });
  });
}
