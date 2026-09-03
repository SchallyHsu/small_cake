import { ok, readSession } from '../../../lib/api';

export async function GET(request) {
  const session = readSession(request);
  return ok({ loggedIn: Boolean(session?.username && session?.jar), username: session?.username || '' });
}
