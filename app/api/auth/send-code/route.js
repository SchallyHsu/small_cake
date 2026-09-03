import { fail, ok, readStage, setStage } from '../../../../lib/api';
import { iaaaError, parseJson, pkuFetch, requestNonce } from '../../../../lib/pku';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const stage = readStage(request);
    if (!stage?.username || !stage?.jar || stage?.challenge?.type !== 'sms') return fail('登录会话已失效，请重新开始登录', 401);

    const url = new URL('https://iaaa.pku.edu.cn/iaaa/sendSMSCode.do');
    url.search = new URLSearchParams({ userName: stage.username, appId: 'wproc', _rand: requestNonce() });
    const json = parseJson(await pkuFetch(stage.jar, url), '验证码发送请求');
    if (json?.success !== true) return fail(iaaaError(json, '验证码发送失败'));

    const target = String(json?.mobileMask || '').trim();
    const message = target ? `验证码已发送至 ${target}` : (stage.challenge.emailVerification ? '邮件验证码已发送' : '短信验证码已发送');
    const response = ok({ message });
    setStage(response, stage);
    return response;
  } catch (error) {
    return fail(error, 502);
  }
}
