# Web CAPTCHA And Risk-Control Experience

本文件用于授权 CTF、实验室、竞赛靶场、拥有权限的 App/API 分析。目标是复用挑战链路分析方法，而不是盲猜验证码算法。

## Applies When

- 登录、注册、查询、下单、票据交换前出现滑块、点选、旋转、短信、人机验证或风控挑战。
- HAR 中出现 `/load`、`/verify`、`captcha_id`、`lot_number`、`challenge`、`seccode`、`pass_token`、`gen_time`、`captcha_output`、`risk`、`fp`、`device`。
- 页面加载第三方安全 SDK，业务请求依赖 `w`、`validate`、`token`、`sign` 或动态 cookie。
- 协议重放单独成功，但业务 API 仍返回风控、未登录或 token 失效。

## Quick Decision

| Signal | Action | Validation |
|---|---|---|
| HAR 有完整挑战链 | 先用 `har_summary.py` 输出请求顺序和字段键 | 能重放到相同挑战类型和状态码 |
| SDK 生成不可手写字段 | 找到 SDK 入口，用本地浏览器/jsdom 作为加密器 | SDK 输出字段通过真实 `/verify` |
| 滑块/点选题型变化 | 把 solver 类型、图片、坐标换算、重试次数做成配置 | 同一链路多次验证成功 |
| 指纹字段变化 | 比对 SDK asset hash、配置、回调名、submit 函数 | 指纹不一致时只把旧经验当清单 |
| 业务 API 仍失败 | 分离登录态、挑战态、业务 token、Referer/Origin/Cookie | 小型只读业务 API 返回身份字段 |

## Evidence To Preserve

保存这些字段能减少重复劳动：

- 入口页面 URL、触发动作、请求顺序、响应状态码
- SDK URL、版本、hash、关键全局对象、回调名
- `/load` 请求参数和响应字段名
- solver 输入：背景图、滑块图、点选目标、坐标系、缩放比例
- `/verify` 请求字段和响应字段名
- 登录/业务 API 使用的最终 validate/token/cookie 放置位置
- 失败响应原文中的关键短语

不要把长期有效 cookie、账号口令或真实用户标识放入经验库。

## Reusable Workflow

1. 用浏览器或 HAR 被动采集一次完整链路。
2. 运行 `scripts/reusable/har_summary.py <file.har> --json out.json`，确认请求顺序、主机、参数键、cookie 变化。
3. 把挑战系统视为上游子系统，先证明 `/load -> solver -> /verify -> validate`，不要直接冲业务登录。
4. 如果字段由 SDK 生成，优先复用 SDK 作为本地加密器；只 patch 本地 replay runtime 中的环境差异。
5. 将 solver、重试、图片输出目录、SDK 路径、指纹校验写成配置，避免把一次性参数写死。
6. 用一个只读业务接口验证最终登录态或业务态，而不是只看登录接口 `success`。

## 大厂验证码/风控常见模式

| 模式 | 关键证据 | 复用重点 |
|---|---|---|
| Geetest v4 类 `/load`/`/verify` | `captcha_id`, `lot_number`, `pass_token`, `gen_time`, `captcha_output` | 保存 SDK 指纹、题型、坐标换算、submit 函数锚点 |
| 滑块 | 背景图、缺口图、缩放比例、轨迹字段 | solver 输出不要直接等于最终位移，先验证坐标系 |
| 点选/语序 | 题目图片、目标顺序、坐标单位 | 保存坐标归一化方式和点击中心修正 |
| 设备指纹 | `fp`, `device_id`, canvas/audio/webgl 字段 | 先区分静态表面属性和生命周期状态 |
| SSO 前置挑战 | 登录前 validate、ticket 交换、业务 token 分离 | 分阶段保存 cookie jar 和 Referer/Origin |

## Pitfalls

- 只保存最终 token 不保存生成链路，下一次必然重做。
- 把验证码通过当成登录态完成，实际业务 token 还没交换。
- 忽略 SDK hash 和配置差异，导致旧 profile 套到新版本失败。
- 坐标按原图宽度算，但页面使用 CSS 缩放或设备像素比。
- 重放时漏掉 JSONP callback、Referer、Origin、cookie path/domain。
- 把浏览器状态和协议状态混在一起，无法判断失败点。

## Research Note Template

```markdown
## Challenge Profile
- Provider/style:
- Entry URL:
- SDK URL/hash:
- Trigger action:
- Load endpoint:
- Verify endpoint:

## Fields
- Load request keys:
- Load response keys:
- Solver input:
- Solver output:
- Verify request keys:
- Verify response keys:
- Business placement:

## Validation
- Clean replay command:
- Expected decisive response:
- Failure phrases:

## Reusable Assets
- Script:
- Config:
- Sample artifact hash:
```
