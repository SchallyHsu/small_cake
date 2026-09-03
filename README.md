# MCK Helper Web

一个面向 iPhone Safari / PWA 的个人自用网页客户端，按 `VariantConst/Marchkov-Helper v3.1.7` 的公开接口行为重新实现核心功能：

- PKU IAAA 登录
- SMS / Email / OTP 二次认证
- 查询 WProc 班车可预约时段
- 发起预约
- 查看当前预约
- 获取乘车二维码
- 取消预约
- 添加到 iPhone 主屏幕，以近似 App 的方式运行

> 非北京大学官方产品。不要把部署链接公开传播，也不要做高频自动化请求。

## 安全设计

- **不会把 IAAA 密码写入数据库、localStorage 或服务器文件。**
- 密码只在登录 API 的一次请求中用于 RSA 加密并提交给 IAAA。
- 成功登录后，仅将 WProc/IAAA 会话 Cookie 放进一个 **AES-256-GCM 加密的 HttpOnly Cookie** 返回给浏览器。
- `SESSION_SECRET` 只保存在你自己的部署平台环境变量中。

## 最简单的部署：Vercel

### 1. 上传代码

把整个项目上传到你自己的 GitHub 仓库（例如 `small_cake`），或在 Vercel 创建项目时直接上传/导入。

### 2. 配置环境变量

在 Vercel → Project → Settings → Environment Variables 添加：

```text
SESSION_SECRET=<至少 32 个字符的随机字符串>
```

推荐使用 64 位以上随机字符串。不要把真实 secret 提交到 GitHub。

### 3. 部署

Vercel 会自动执行：

```bash
npm install
npm run build
```

部署完成后会得到一个 HTTPS 地址，例如：

```text
https://your-project.vercel.app
```

### 4. iPhone 添加到主屏幕

1. 用 Safari 打开部署地址。
2. 点底部“分享”。
3. 选择“添加到主屏幕”。
4. 以后从桌面打开即可。

## 本地运行

需要 Node.js 20+：

```bash
cp .env.example .env.local
# 修改 SESSION_SECRET
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 重要限制

1. 这是根据公开仓库 `VariantConst/Marchkov-Helper` v3.1.7 的当前接口行为实现；上游 IAAA/WProc 改接口后，网页也可能需要更新。
2. 如果 IAAA 要求图形验证码，本项目会提示先到 IAAA 官方网页完成一次登录。它不会尝试绕过验证码。
3. Vercel/云服务器能否访问 PKU 接口取决于上游网络策略。v3.1.7 已包含校外登录相关逻辑，但学校未来可能调整规则。
4. 当前版只实现最核心的预约链路，没有照搬 Flutter 版所有设置、亮度控制、历史统计和自动预约功能。
5. 不建议开启无人值守自动抢票或高频轮询，避免违反上游系统规则或造成服务压力。

## 目录

```text
app/
  api/                 服务端 API，仅服务器访问 PKU
  page.js              手机端网页 UI
lib/
  pku.js               IAAA/WProc 网络与登录协议
  http-cookies.js      上游 Cookie Jar
  secure-session.js    AES-GCM 会话加密
public/                 PWA 图标
```

## 来源说明

功能行为参考公开项目：`https://github.com/VariantConst/Marchkov-Helper` 的 `v3.1.7`。本项目是独立网页重写，不是原项目官方 Web 发行版。
