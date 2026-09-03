"use client";

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ ok: false, error: '服务器返回异常' }));
  if (!response.ok || !data.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

function beijingDateString() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function minutesUntilBus(date, time, nowMs = Date.now()) {
  const [year, month, day] = String(date).split('-').map(Number);
  const [hour, minute] = String(time).split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  // 北京时间全年固定 UTC+8。
  const departureMs = Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0);
  return Math.floor((departureMs - nowMs) / 60000);
}

function inferStartStation(routeName) {
  const compact = String(routeName || '').trim().replace(/\s+/g, '');

  for (const station of ['新燕园', '燕园']) {
    if (compact.startsWith(station)) return station;
  }

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

function BusItem({ bus, actionKey, reserve, nowTick }) {
  const key = `r-${bus.resourceId}-${bus.period}`;
  const minutes = minutesUntilBus(bus.date, bus.time, nowTick);
  const imminent = minutes >= 0 && minutes <= 10;

  return (
    <div className={`item ${imminent ? 'item-imminent' : ''}`}>
      <div className="item-top">
        <div>
          <div className="route">{bus.routeName}</div>
          <div className="meta">
            <span>{bus.date}</span>
            <span className="badge ok">余 {bus.remaining}</span>
            {imminent && <span className="badge soon">{minutes <= 0 ? '即将发车' : `${minutes} 分钟后`}</span>}
          </div>
        </div>
        <div className="time">{bus.time}</div>
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={Boolean(actionKey)} onClick={() => reserve(bus)}>
          {actionKey === key ? '预约中…' : '预约'}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [user, setUser] = useState(null);

  const [loginUser, setLoginUser] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [tab, setTab] = useState('buses');
  const [date, setDate] = useState(beijingDateString());
  const [buses, setBuses] = useState([]);
  const [busesBusy, setBusesBusy] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [resBusy, setResBusy] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [qr, setQr] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    api('/api/session').then((d) => {
      setLoggedIn(d.loggedIn);
      setUsername(d.username || '');
      if (d.loggedIn) loadUser();
    }).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (loggedIn && tab === 'buses') loadBuses();
    if (loggedIn && tab === 'mine') loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, tab]);

  // 更新时间提示；如果正在查看“今天”的班次，则每分钟自动刷新，
  // 防止已经发车的班次继续停留在页面中。
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
      if (loggedIn && tab === 'buses' && date === beijingDateString()) {
        loadBuses();
      }
    }, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, tab, date]);

  async function loadUser() {
    try {
      const d = await api('/api/user');
      setUser(d.user);
    } catch {}
  }

  async function prepareLogin(e) {
    e?.preventDefault();
    setError('');
    setMessage('');
    setLoginBusy(true);
    try {
      const d = await api('/api/auth/prepare', {
        method: 'POST',
        body: JSON.stringify({ username: loginUser }),
      });
      setChallenge(d.challenge);
      if (d.challenge.type === 'none') await finishLogin(d.challenge);
      else setMessage(d.challenge.type === 'otp' ? '请输入手机令牌，然后登录。' : '该账号需要二次验证。');
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoginBusy(false);
    }
  }

  async function sendCode() {
    setError('');
    setMessage('');
    setLoginBusy(true);
    try {
      const d = await api('/api/auth/send-code', { method: 'POST', body: '{}' });
      setMessage(d.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoginBusy(false);
    }
  }

  async function finishLogin(ch = challenge) {
    setError('');
    setLoginBusy(true);
    try {
      const d = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password, code, rememberDevice: remember }),
      });
      setLoggedIn(true);
      setUsername(d.username || loginUser);
      setPassword('');
      setCode('');
      setChallenge(null);
      setMessage('');
      await loadUser();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setLoggedIn(false);
    setUser(null);
    setBuses([]);
    setReservations([]);
    setChallenge(null);
    setPassword('');
  }

  async function loadBuses() {
    setBusesBusy(true);
    setError('');
    try {
      const d = await api(`/api/buses?date=${encodeURIComponent(date)}`);
      setBuses(d.buses || []);
      setNowTick(Date.now());
    } catch (e) {
      setError(e.message);
      if (e.message.includes('登录')) setLoggedIn(false);
    } finally {
      setBusesBusy(false);
    }
  }

  async function loadReservations() {
    setResBusy(true);
    setError('');
    try {
      const d = await api('/api/reservations/mine');
      setReservations(d.reservations || []);
    } catch (e) {
      setError(e.message);
      if (e.message.includes('登录')) setLoggedIn(false);
    } finally {
      setResBusy(false);
    }
  }

  async function reserve(bus) {
    const key = `r-${bus.resourceId}-${bus.period}`;
    setActionKey(key);
    setError('');
    try {
      await api('/api/reservations/create', {
        method: 'POST',
        body: JSON.stringify({
          resourceId: bus.resourceId,
          date: bus.date,
          period: bus.period,
        }),
      });
      setMessage(`已预约：${bus.routeName} ${bus.date} ${bus.time}`);
      await Promise.all([loadBuses(), loadReservations()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionKey('');
    }
  }

  async function cancelReservation(r) {
    const key = `c-${r.id}`;
    setActionKey(key);
    setError('');
    try {
      await api('/api/reservations/cancel', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: r.id,
          hallAppointmentDataId: r.hallAppointmentDataId,
        }),
      });
      setMessage(`已取消：${r.resourceName}`);
      await loadReservations();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionKey('');
    }
  }

  async function showQr(r) {
    const key = `q-${r.id}`;
    setActionKey(key);
    setError('');
    try {
      const d = await api(
        `/api/reservations/qrcode?id=${encodeURIComponent(r.id)}&dataId=${encodeURIComponent(r.hallAppointmentDataId)}`,
      );
      if (!d.code) throw new Error('二维码内容为空');
      const image = await QRCode.toDataURL(d.code, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      setQr({ image, title: r.resourceName, subtitle: r.appointmentTime });
    } catch (e) {
      setError(e.message);
    } finally {
      setActionKey('');
    }
  }

  const titleName = useMemo(() => user?.name || username || '已登录', [user, username]);

  const upcomingBuses = useMemo(
    () => buses
      .map((bus) => ({ ...bus, minutesUntil: minutesUntilBus(bus.date, bus.time, nowTick) }))
      .filter((bus) => bus.minutesUntil >= 0 && bus.minutesUntil <= 10)
      .sort((a, b) => a.minutesUntil - b.minutesUntil),
    [buses, nowTick],
  );

  const groupedBuses = useMemo(() => {
    const groups = new Map();

    for (const bus of buses) {
      const station = bus.startStation || inferStartStation(bus.routeName);
      if (!groups.has(station)) groups.set(station, []);
      groups.get(station).push(bus);
    }

    const preferredOrder = ['燕园', '新燕园'];
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = preferredOrder.indexOf(a);
      const bi = preferredOrder.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.localeCompare(b, 'zh-CN');
    });
  }, [buses]);

  if (checking) {
    return (
      <main className="page">
        <div className="shell">
          <div className="brand">
            <div className="brand-badge">MCK</div>
            <div>
              <h1>MCK Helper Web</h1>
              <p>正在检查登录状态…</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="brand">
          <div className="brand-badge">MCK</div>
          <div>
            <h1>MCK Helper Web</h1>
            <p>iPhone Safari / PWA · v3.1.7 compatible</p>
          </div>
        </div>

        {!loggedIn ? (
          <section className="card">
            <h2>北大账号登录</h2>
            <p className="card-sub">
              登录请求由你的私有部署服务器转发至 IAAA / WProc。密码只用于本次登录请求，不写入数据库或浏览器存储。
            </p>
            <form onSubmit={challenge ? (e) => { e.preventDefault(); finishLogin(); } : prepareLogin}>
              <div className="field">
                <label>账号</label>
                <input
                  className="input"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  disabled={Boolean(challenge)}
                  placeholder="学号 / IAAA 账号"
                />
              </div>

              <div className="field">
                <label>密码</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="IAAA 密码"
                />
              </div>

              {challenge?.type !== 'none' && challenge && (
                <>
                  <div className="field">
                    <label>
                      {challenge.type === 'otp'
                        ? '手机令牌'
                        : (challenge.emailVerification ? '邮件验证码' : '短信验证码')}
                    </label>
                    <div className="row">
                      <input
                        className="input grow"
                        inputMode="numeric"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="验证码"
                      />
                      {challenge.type === 'sms' && (
                        <button type="button" className="btn btn-small" onClick={sendCode} disabled={loginBusy}>
                          发送
                        </button>
                      )}
                    </div>
                  </div>

                  {challenge.canRememberDevice && (
                    <label style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 13,
                      color: 'var(--muted)',
                      margin: '10px 2px',
                    }}>
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      记住本设备（延长本网页会话）
                    </label>
                  )}
                </>
              )}

              <button
                className="btn btn-primary btn-wide"
                disabled={loginBusy || !loginUser || !password}
              >
                {loginBusy && <span className="spinner" />}
                {challenge ? '登录' : '继续登录'}
              </button>

              {challenge && (
                <button
                  type="button"
                  className="btn btn-wide"
                  onClick={() => {
                    setChallenge(null);
                    setCode('');
                    setMessage('');
                    setError('');
                  }}
                >
                  更换账号
                </button>
              )}
            </form>

            {message && <div className="notice notice-info">{message}</div>}
            {error && <div className="notice notice-error">{error}</div>}
          </section>
        ) : (
          <>
            <section className="card" style={{ marginBottom: 14 }}>
              <div className="header-row">
                <div>
                  <div className="user-name">{titleName}</div>
                  <div className="user-meta">
                    {user?.studentId || username}
                    {user?.college ? ` · ${user.college}` : ''}
                  </div>
                </div>
                <button className="btn btn-small" onClick={logout}>退出</button>
              </div>
              <div className="notice notice-info" style={{ marginTop: 0 }}>
                建议把这个站点保持为私有部署。服务器只保存加密后的 WProc 会话 Cookie，不保存你的 IAAA 密码。
              </div>
            </section>

            <div className="tabs">
              <button
                className={`tab ${tab === 'buses' ? 'active' : ''}`}
                onClick={() => setTab('buses')}
              >
                可预约班车
              </button>
              <button
                className={`tab ${tab === 'mine' ? 'active' : ''}`}
                onClick={() => setTab('mine')}
              >
                我的预约
              </button>
            </div>

            {message && <div className="notice notice-ok" style={{ marginBottom: 12 }}>{message}</div>}
            {error && <div className="notice notice-error" style={{ marginBottom: 12 }}>{error}</div>}

            {tab === 'buses' ? (
              <section className="card">
                {upcomingBuses.length > 0 && (
                  <div className="upcoming-alert">
                    <div className="upcoming-title">
                      <span className="pulse-dot" />
                      10 分钟内有班车即将发车
                    </div>
                    <div className="upcoming-list">
                      {upcomingBuses.map((bus) => (
                        <div
                          className="upcoming-row"
                          key={`soon-${bus.resourceId}-${bus.period}-${bus.date}`}
                        >
                          <div>
                            <div className="upcoming-route">
                              {bus.startStation || inferStartStation(bus.routeName)} · {bus.routeName}
                            </div>
                            <div className="upcoming-meta">
                              余 {bus.remaining} 个名额
                            </div>
                          </div>
                          <div className="upcoming-time">
                            <strong>{bus.time}</strong>
                            <span>
                              {bus.minutesUntil <= 0 ? '即将发车' : `${bus.minutesUntil} 分钟后`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="toolbar">
                  <div className="field">
                    <label>日期</label>
                    <input
                      type="date"
                      className="input"
                      min={beijingDateString()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={loadBuses}
                    disabled={busesBusy}
                  >
                    {busesBusy ? '查询中' : '查询'}
                  </button>
                </div>

                <div className="list">
                  {busesBusy ? (
                    <div className="empty">正在加载班车…</div>
                  ) : buses.length === 0 ? (
                    <div className="empty">当前没有可预约班次</div>
                  ) : (
                    groupedBuses.map(([station, stationBuses]) => (
                      <div className="station-group" key={station}>
                        <div className="station-header">
                          <div>
                            <div className="station-title">{station} 出发</div>
                            <div className="station-count">{stationBuses.length} 个可预约班次</div>
                          </div>
                        </div>

                        <div className="station-list">
                          {stationBuses.map((bus) => (
                            <BusItem
                              key={`${bus.resourceId}-${bus.period}-${bus.date}`}
                              bus={bus}
                              actionKey={actionKey}
                              reserve={reserve}
                              nowTick={nowTick}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : (
              <section className="card">
                <div className="header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>当前预约</h2>
                    <div className="user-meta">可查看乘车码或取消预约</div>
                  </div>
                  <button className="btn btn-small" onClick={loadReservations} disabled={resBusy}>
                    刷新
                  </button>
                </div>

                <div className="list">
                  {resBusy ? (
                    <div className="empty">正在加载预约…</div>
                  ) : reservations.length === 0 ? (
                    <div className="empty">当前没有预约</div>
                  ) : (
                    reservations.map((r) => (
                      <div className="item" key={r.id}>
                        <div className="item-top">
                          <div>
                            <div className="route">{r.resourceName}</div>
                            <div className="meta">
                              <span>{r.appointmentTime}</span>
                            </div>
                          </div>
                        </div>
                        <div className="actions">
                          <button
                            className="btn"
                            disabled={Boolean(actionKey)}
                            onClick={() => showQr(r)}
                          >
                            {actionKey === `q-${r.id}` ? '获取中…' : '乘车码'}
                          </button>
                          <button
                            className="btn btn-danger"
                            disabled={Boolean(actionKey)}
                            onClick={() => cancelReservation(r)}
                          >
                            {actionKey === `c-${r.id}` ? '取消中…' : '取消预约'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </>
        )}

        <div className="footer-note">
          非北京大学官方产品。仅建议个人自用；请遵守相关系统使用规则，不要进行高频自动化请求。
        </div>
      </div>

      {qr && (
        <div className="modal-backdrop" onClick={() => setQr(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="qr-title">{qr.title}</div>
            <div className="qr-sub">{qr.subtitle}</div>
            <img className="qr" src={qr.image} alt="乘车二维码" />
            <button className="btn btn-primary btn-wide" onClick={() => setQr(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
