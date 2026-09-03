import { fail, ok, setStage } from '../../../../lib/api';
import { challengeFromIaaa, iaaaError, parseJson, pkuFetch, requestNonce } from '../../../../lib/pku';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { username: raw } = await request.json();
    const username = String(raw || '').trim();
    if (!username) return fail('请输入账号');

    const jar = [];
    const oauth = new URL('https://iaaa.pku.edu.cn/iaaa/oauth.jsp');
    oauth.search = new URLSearchParams({
      appID: 'wproc',
      appName: '办事大厅预约版',
      redirectUrl: 'https://wproc.pku.edu.cn/site/login/cas-login?redirect_url=https%3A%2F%2Fwproc.pku.edu.cn%2Fv2%2Fsite%2Findex',
    });
    await pkuFetch(jar, oauth);

    const captcha = parseJson(await pkuFetch(jar, 'https://iaaa.pku.edu.cn/iaaa/isShowCode.do'), 'IAAA 验证码检查');
    if (captcha?.success === true) {
      return fail('该账号当前需要图形验证码。请先在 IAAA 官方网页完成一次登录，再回来重试。', 409);
    }

    const keyJson = parseJson(await pkuFetch(jar, 'https://iaaa.pku.edu.cn/iaaa/getPublicKey.do'), 'IAAA 公钥请求');
    if (keyJson?.success !== true || typeof keyJson?.key !== 'string' || !keyJson.key) {
      return fail(iaaaError(keyJson, '无法获取 IAAA 登录公钥'));
    }

    const mobile = new URL('https://iaaa.pku.edu.cn/iaaa/isMobileAuthen.do');
    mobile.search = new URLSearchParams({ userName: username, appId: 'wproc', _rand: requestNonce() });
    const mobileJson = parseJson(await pkuFetch(jar, mobile), 'IAAA 二次认证检查');
    const challenge = challengeFromIaaa(mobileJson);

    const response = ok({ challenge });
    setStage(response, { username, publicKeyPem: keyJson.key, challenge, jar });
    return response;
  } catch (error) {
    return fail(error, 502);
  }
}
