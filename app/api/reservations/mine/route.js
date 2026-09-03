import { ok } from '../../../../lib/api';
import { isWprocOk, parseJson, pkuFetch } from '../../../../lib/pku';
import { withSession } from '../../../../lib/wproc-route';

export const runtime = 'nodejs';

function beijingDateOffset(offsetDays = 0) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );

  const base = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  ));

  base.setUTCDate(base.getUTCDate() + offsetDays);

  return [
    base.getUTCFullYear(),
    String(base.getUTCMonth() + 1).padStart(2, '0'),
    String(base.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeReservation(x) {
  return {
    id: String(x?.id ?? ''),
    hallAppointmentDataId: String(
      x?.hall_appointment_data_id ??
      x?.periodList?.[0]?.id ??
      '',
    ),
    appointmentTime: String(x?.appointment_tim || '').trim(),
    resourceName: String(x?.resource_name || ''),
    resourceId: String(x?.resource_id ?? ''),
    status: Number(x?.status ?? 0),
  };
}

export async function GET(request) {
  return withSession(request, async (session) => {
    const currentUrl = new URL(
      'https://wproc.pku.edu.cn/site/reservation/my-list-time',
    );

    currentUrl.search = new URLSearchParams({
      p: '1',
      page_size: '0',
      status: '2',
      sort_time: 'true',
      sort: 'asc',
    });

    const currentJson = parseJson(
      await pkuFetch(session.jar, currentUrl),
      '预约列表',
    );

    if (!isWprocOk(currentJson)) {
      throw new Error(currentJson?.m || '预约列表获取失败');
    }

    const recentUrl = new URL(
      'https://wproc.pku.edu.cn/site/reservation/my-list-time',
    );

    recentUrl.search = new URLSearchParams({
      p: '1',
      page_size: '0',
      status: '0',
      sort_time: 'true',
      sort: 'desc',
      date_sta: beijingDateOffset(0),
      date_end: beijingDateOffset(6),
    });

    const recentJson = parseJson(
      await pkuFetch(session.jar, recentUrl),
      '近期预约状态',
    );

    if (!isWprocOk(recentJson)) {
      throw new Error(recentJson?.m || '近期预约状态获取失败');
    }

    const recentReserved = (recentJson?.d?.data || [])
      .map(normalizeReservation)
      .filter((x) => x.status === 7 && x.resourceId && x.appointmentTime);

    const recentById = new Map(
      recentReserved.map((x) => [x.id, x]),
    );

    const reservations = (currentJson?.d?.data || []).map((raw) => {
      const current = normalizeReservation(raw);
      const recent = recentById.get(current.id);

      if (!recent) return current;

      return {
        ...current,
        resourceId: current.resourceId || recent.resourceId,
        hallAppointmentDataId:
          current.hallAppointmentDataId || recent.hallAppointmentDataId,
      };
    });

    const knownIds = new Set(reservations.map((x) => x.id));
    for (const item of recentReserved) {
      if (!knownIds.has(item.id)) {
        reservations.push(item);
        knownIds.add(item.id);
      }
    }

    reservations.sort((a, b) =>
      a.appointmentTime.localeCompare(b.appointmentTime),
    );

    return ok({
      reservations,
      reservedBuses: recentReserved,
    });
  });
}
