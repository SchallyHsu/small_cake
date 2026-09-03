MCK Helper：预约状态/取消预约真正修复版

必须同时替换两个完整文件：

1. app/page.js
2. app/api/reservations/mine/route.js

这次修复依据 Marchkov Helper v3.1.7 原版逻辑：
- 请求 my-list-time status=0 + date_sta/date_end
- 只把 status == 7 视为已预约
- 用 resource_id + appointment_tim 精确匹配班次
- 取消预约使用真实 appointment id + periodList[0].id / hall_appointment_data_id

效果：
- 可预约班车页面真正识别已预约班次
- 已预约班次显示“已预约” + “取消预约”
- 10分钟提醒区已预约班次显示“取消预约”
- 取消后状态刷新
- 我的预约继续直接显示二维码
- 新预约成功后自动弹出二维码
