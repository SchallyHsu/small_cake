import { clearSession, clearStage, ok } from '../../../../lib/api';

export async function POST() {
  const response = ok();
  clearSession(response);
  clearStage(response);
  return response;
}
