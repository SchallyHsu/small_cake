import { clearStage, fail, ok, readStage, setSession } from '../../../../lib/api';
import { encryptPassword, establishWproc, iaaaError, parseJson, pkuFetch, validateWproc } from '../../../../lib/pku';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const stage = readStage(request);
    if (!stage?.username || !stage?.publicKeyPem || !stage?.jar) return fail('登录会话已失效，请重新开始登录', 401);
    const { password = '', code = '', rememberDevice = false } = await request.json();
    if (!password) return fail('请输入密码');

    const type = stage.challenge?.type || 'none';
    if (type !== 'none' && !String(code).trim()) return fail(type === 'otp' ? '请输入手机令牌' : '请输入验证码');

    const encrypted = encryptPassword(String(password), stage.publicKeyPem);
    const form = {
      appid: 'wproc',
      userName: stage.username,
      password: encrypted,
      randCode: '',
      smsCode: type === 'sms' ? String(code).trim() : '',
      otpCode: type === 'otp' ? String(code).trim() : '',
      remTrustChk: String(Boolean(rememberDevice)),
      redirUrl: 'https://wproc.pku.edu.cn/site/login/cas-login?redirect_url=https%3A%2F%2Fwproc.pku.edu.cn%2Fv2%2Fsite%2Findex',
    };
    const json = parseJson(await pkuFetch(stage.jar, 'https://iaaa.pku.edu.cn/iaaa/oauthlogin.do', { method: 'POST', form }), 'IAAA 登录');
    if (json?.success !== true || typeof json?.token !== 'string' || !json.token) return fail(iaaaError(json, '登录失败'), 401);

    await establishWproc(stage.jar, json.token);
    await validateWproc(stage.jar);

    const maxAge = rememberDevice ? 7 * 24 * 60 * 60 : 12 * 60 * 60;
    const response = ok({ username: stage.username });
    setSession(response, { username: stage.username, jar: stage.jar, ttl: maxAge }, maxAge);
    clearStage(response);
    return response;
  } catch (error) {
    return fail(error, 502);
  }
}
