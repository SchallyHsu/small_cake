import { fail, requireSession, setSession } from './api';

export async function withSession(request, handler) {
  try {
    const session = requireSession(request);
    const response = await handler(session);
    setSession(response, { username: session.username, jar: session.jar, ttl: session.ttl }, session.ttl || 12 * 60 * 60);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message, message.includes('登录') ? 401 : 502);
  }
}
