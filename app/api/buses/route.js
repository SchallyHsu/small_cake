import { ok } from '../../../lib/api';
import { isWprocOk, normalizeTime, parseJson, pkuFetch } from '../../../lib/pku';
import { withSession } from '../../../lib/wproc-route';

export const runtime = 'nodejs';

function beijingNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function inferStartStation(routeName) {
  const original = String(routeName || '').trim();
  const compact = original.replace(/\s+/g, '');

  // 常见路线名优先按明确前缀识别。
  for (const station of ['新燕园', '燕园']) {
    if (compact.startsWith(station)) return station;
  }

  // 兼容“起点→终点 / 起点-终点 / 起点至终点 / 起点到终点”等命名。
  for (const separator of ['→', '->', '—', '–', '-', '至', '到']) {
    const index = compact.indexOf(separator);
    if (index > 0) {
      const candidate = compact.slice(0, index)
        .replace(/^(班车|校车)/, '')
        .replace(/(校区|站)$/g, '');
      if (candidate) return candidate;
    }
  }

  return '其他起点';
}

export async function GET(request) {
  return withSession(request, async (session) => {
    const date = new URL(request.url).searchParams.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式不正确');

    const now = beijingNow();

    // “可预约班车”不展示历史日期。
    if (date < now.date) return ok({ buses: [], now });

    const url = new URL('https://wproc.pku.edu.cn/site/reservation/list-page');
    url.search = new URLSearchParams({
      hall_id: '1',
      time: date,
      p: '1',
      page_size: '0',
    });

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

          const routeName = String(bus?.name || '');
          const item = {
            routeName,
            startStation: inferStartStation(routeName),
            resourceId: String(bus?.id ?? ''),
            date: String(slot?.abscissa || date).trim(),
            time: normalizeTime(slot?.yaxis),
            period: String(slot?.time_id ?? ''),
            remaining,
            status: slot?.row?.status,
          };

          // 始终按北京时间判断是否已经发车。
          if (item.date < now.date) continue;
          if (item.date === now.date && item.time <= now.time) continue;

          const key = `${item.date}_${item.time}_${item.resourceId}_${item.period}`;
          if (!seen.has(key)) {
            seen.add(key);
            buses.push(item);
          }
        }
      }
    }

    buses.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return ok({ buses, now });
  });
}
