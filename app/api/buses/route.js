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

function normalizeDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function inferStartStation(routeName) {
  const compact = String(routeName || '').trim().replace(/\s+/g, '');

  for (const station of ['新燕园', '燕园']) {
    if (compact.startsWith(station)) return station;
  }

  for (const separator of ['→', '->', '—', '–', '-', '至', '到']) {
    const index = compact.indexOf(separator);
    if (index > 0) {
      const candidate = compact
        .slice(0, index)
        .replace(/^(班车|校车)/, '')
        .replace(/(校区|站)$/g, '');
      if (candidate) return candidate;
    }
  }

  return '其他起点';
}

export async function GET(request) {
  return withSession(request, async (session) => {
    const rawDate = new URL(request.url).searchParams.get('date') || '';
    const date = normalizeDate(rawDate);

    if (!date) throw new Error('日期格式不正确');

    const now = beijingNow();

    // 历史日期不属于“可预约班车”。
    if (date < now.date) {
      return ok({
        buses: [],
        queryDate: date,
        now,
      });
    }

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

          // WProc 的 list-page 可能一次返回不止一天的数据。
          // 这里必须以 slot.abscissa 为准，再严格筛选用户选中的日期。
          const slotDate = normalizeDate(slot?.abscissa);
          if (!slotDate || slotDate !== date) continue;

          const routeName = String(bus?.name || '');
          const item = {
            routeName,
            startStation: inferStartStation(routeName),
            resourceId: String(bus?.id ?? ''),
            date: slotDate,
            time: normalizeTime(slot?.yaxis),
            period: String(slot?.time_id ?? ''),
            remaining,
            status: slot?.row?.status,
          };

          // 只有查询“今天”时才过滤已经发车的班次。
          // 查询未来日期时保留当天全部有余票班次。
          if (date === now.date && item.time <= now.time) continue;

          const key = `${item.date}_${item.time}_${item.resourceId}_${item.period}`;

          if (!seen.has(key)) {
            seen.add(key);
            buses.push(item);
          }
        }
      }
    }

    buses.sort((a, b) => a.time.localeCompare(b.time));

    return ok({
      buses,
      queryDate: date,
      now,
    });
  });
}
