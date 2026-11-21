# 轻量安全审计平台 — 后端接口清单（v1.2 初稿）

> 适用架构：前后端分离，前端纯静态页面（HTML/CSS/JS），后端 Flask + SQLite
> 接口前缀：`/api`
> 本文档为**前后端对接的唯一依据**。前端按本文直接编码；后端按本文实现。两者不一致时，以本文为准。

> **先分清两套"接口"（很多同学会混）：**
> 1. **Flask ↔ 数据库**：`users` / `audit_logs` / `reports` 三张表由 SQLAlchemy 模型定义，只存在于后端内部，前端**永远不直接访问数据库**。
> 2. **Flask ↔ 前端**：本文列出的 HTTP `/api/*` 接口，是前端唯一需要对接的一套接口。前端只认 URL、HTTP 方法、JSON 入参/出参，不关心底层用 SQLite 还是别的数据库。

---

## 一、接口总览

| # | 功能模块 | 接口名称 | 方法 | 路径 | 需登录 | 说明 |
|---|---------|---------|------|------|--------|------|
| 1 | 用户 | 用户注册 | POST | `/api/auth/register` | 否 | 注册成功后直接返回 token |
| 2 | 用户 | 用户登录 | POST | `/api/auth/login` | 否 | 返回 token，前端存 localStorage |
| 3 | 用户 | 获取当前用户 | GET | `/api/auth/me` | 是 | 页面刷新后校验登录态 |
| 4 | 进度（旧版） | 保存学习进度 | POST | `/api/progress/save` | 是 | **已停用，不再注册**，与文件审计无关 |
| 5 | 进度（旧版） | 查询学习进度列表 | GET | `/api/progress/list` | 是 | **已停用，不再注册** |
| 6 | 进度（旧版） | 删除进度记录 | DELETE | `/api/progress/{id}` | 是 | **已停用，不再注册** |
| 7 | 检测 | URL 安全检测 | POST | `/api/scanner/scan` | 否 | 未登录也能检测，只是不存历史 |
| 8 | 检测 | 检测历史列表 | GET | `/api/scanner/history` | 是 | 支持分页 |
| 9 | 审计 | 查询审计日志 | GET | `/api/audit-logs` | 是（仅 admin） | 分页 + 多条件筛选；普通用户 403 |
| 10 | 系统 | 探活 | GET | `/api/ping` | 否 | 最轻量探活，不查库、不写日志 |
| 11 | 系统 | 健康检查 | GET | `/api/health` | 否 | 探活 + 数据库连通性 |
| 12 | 报告 | 保存文件审计结果 | POST | `/api/reports/save` | 是 | **已实现**，存 vul_list/stat/scan_meta |
| 13 | 报告 | 我的报告列表 | GET | `/api/reports` | 是 | **已实现**，可按 `report_type=file/url` 筛选 |
| 14 | 报告 | 报告详情 | GET | `/api/reports/{report_no}` | 是 | **已实现**，仅本人可见，返回完整 vul_list |
| 15 | 报告 | 删除我的报告 | DELETE | `/api/reports/{report_no}` | 是 | **已实现**，仅本人可删 |

> - 第 4-6 项是旧版"学习进度"接口，**已从 app.py 中移除注册，不能再调用**；前端没有学习进度页面，请忽略这三个接口。
> - 文件审计（功能2）请接第 12-15 项；它们存的就是前端 `scan.js` 返回的 `ScanResult`。
> - 未登录调用第 12-15 项会返回 401，前端按降级策略存 `localStorage` 即可。
> - 关于"退出登录"：**不提供后端接口**。token 是无状态的，前端清除 `localStorage` 中的 token 即可视为退出。后端无需感知。

---

## 二、全局约定（前端必须先读这一节）

### 2.1 基础地址

| 环境 | Base URL |
|------|----------|
| 本地开发 | `http://127.0.0.1:5000` |
| 线上部署 | 部署后填写，前端抽到 `config.js` 里，**禁止硬编码散落在各页面** |

### 2.2 统一响应结构

所有接口（包括出错的接口）返回的都是 JSON，结构固定：

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "errors": []
}
```

| 字段 | 类型 | 是否必有 | 说明 |
|------|------|---------|------|
| `code` | int | 是 | 业务状态码，与 HTTP 状态码保持一致 |
| `message` | string | 是 | 给用户看的提示文案，前端直接展示，**不要在前端按 code 自己拼中文** |
| `data` | any | 是 | 业务数据。失败时固定为 `null` |
| `errors` | array | 否 | 仅"参数校验失败"时出现，用于前端定位到具体表单项 |

`errors` 元素结构：

```json
{ "field": "username", "message": "长度需在 3-20 个字符之间" }
```

### 2.3 状态码约定

| HTTP 状态码 | `code` | 使用场景 |
|-------------|--------|---------|
| 200 | 200 | 成功 |
| 400 | 400 | 参数缺失 / 类型错误 / 格式不合法 / 业务校验不通过 |
| 401 | 401 | 未登录、token 无效或过期、用户名或密码错误 |
| 403 | 403 | 已登录但无权限（如普通用户访问审计日志） |
| 404 | 404 | 目标资源不存在（如删除他人或不存在的进度记录） |
| 409 | 409 | 资源冲突（用户名已被占用） |
| 429 | 429 | 请求过于频繁（触发限流） |
| 500 | 500 | 服务端内部错误 |
| 503 | 503 | 检测服务不可用（本服务自身故障，非目标网站故障） |

> ⚠️ 前端判断成败请以 `code` 为准，不要只看 HTTP 200。后端也必须让 HTTP 状态码与 `code` 一致（两者不一致会让浏览器工具、监控、网关全部误判）。

### 2.4 认证约定

- 登录/注册成功后返回 `token`（字符串，有效期 7 天）。
- 之后所有"需登录"接口，请求头必须带：

```
Authorization: Bearer <token>
```

- 前端存储：`localStorage.setItem('token', token)`
- **生产环境禁止**用 `?token=xxx` 查询参数传 token（会出现在浏览器历史、服务器访问日志、Referer 里）。
- 任何接口返回 `401` 时，前端统一处理：清除本地 token → 提示"登录已过期" → 降级为游客模式（功能3仍可用）。

### 2.5 参数通用约定（重要，前端最容易踩）

| 约定项 | 规则 |
|--------|------|
| 命名风格 | 全部小写下划线：`page`、`pagesize`、`quiz_name`、`max_score` |
| 大小写 | **严格区分大小写**。`pageSize` ≠ `pagesize`，写成 `pageSize` 后端视为"未传该参数" |
| 请求体格式 | 一律 `Content-Type: application/json`，body 为 JSON 对象 |
| 数字类型 | 传 JSON 数字 `80`，不要传字符串 `"80"` |
| 布尔类型 | 传 `true` / `false`，不要传 `"true"` / `1` |
| 路径参数 | 传数字，如 `/api/progress/12`，不要带引号 |
| 时间格式 | 统一 `"YYYY-MM-DD HH:mm:ss"`，时区 `Asia/Shanghai`，后端不做时区转换 |
| 中文字符 | URL 查询参数中的中文必须 `encodeURIComponent` |

### 2.6 可选参数与空值约定（"传 null 还是不传 key"）

**总原则：可选参数不用时，就不要传这个 key。** 不要传 `null`，不要传 `"null"`，不要传 `"undefined"`，不要传空字符串占位。

| 场景 | 前端做法 | 后端处理 |
|------|---------|---------|
| 可选筛选参数不使用 | **省略该 key** | 使用默认值，或该条件不参与筛选 |
| 可选参数显式传 `null` | 不推荐 | 兼容处理，等同于"未传" |
| 可选字符串筛选传 `""` | 允许 | 视为"未传"，不参与筛选 |
| 必填参数不传 key | — | `400`，`errors` 中指出缺哪个字段 |
| 必填参数传 `""` 或 `null` | — | `400` |
| 数组参数无数据 | 传 `[]` 或省略 | `[]` 表示"空"，存为空列表；省略表示"不更新该字段" |
| 分页参数 | 不传则用默认值 | `page` 默认 1，`pagesize` 默认 10 |

### 2.7 分页约定

所有返回列表的接口（进度、检测历史、日志）统一这种结构：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [],
    "total": 137,
    "page": 1,
    "pagesize": 10,
    "total_pages": 14
  }
}
```

| 参数 | 类型 | 必填 | 默认 | 约束 |
|------|------|------|------|------|
| `page` | int | 否 | 1 | ≥ 1；传 0、负数、非数字 → 400 |
| `pagesize` | int | 否 | 10 | 1 ~ 100，超过 100 按 100 处理；传 0 或负数 → 400 |

**边界规则**（前端可以放心依赖）：

- `page` 超过总页数 → 返回 `200`，`list` 为空数组，`total` 仍为真实总数（不报错）。
- `total_pages = ceil(total / pagesize)`，`total = 0` 时为 `0`。
- 空列表永远返回 `[]`，**不要返回 `null`**。

### 2.8 审计日志字段规范（固定，不允许随意改名）

所有审计日志记录都包含以下固定字段，字段名不允许随意改：

| 字段名 | 类型 | 中文名 | 说明 |
|--------|------|--------|------|
| `log_id` | int | 日志 ID | 唯一标识 |
| `operator` | string | 操作人 | 用户名快照；游客为 `"游客"` |
| `operator_id` | int/null | 操作人 ID | 用户被删后仍保留日志，所以可能查不到对应用户 |
| `operate_time` | string | 操作时间 | `YYYY-MM-DD HH:mm:ss` |
| `operate_type` | string | 操作类型 | 枚举，见下表 |
| `target_type` | string | 操作对象类型 | `user` / `session` / `report` |
| `target_id` | string/null | 操作对象 ID | 对应对象的主键或编号 |
| `detail` | string/null | 操作内容 | JSON 字符串，写入前已脱敏；这就是"做了什么"的结构化还原 |
| `result` | string | 结果 | `SUCCESS` / `FAIL` |
| `error_code` | int/null | 错误码 | 失败时对应 HTTP 状态码 |
| `message` | string/null | 结果说明 | 如"注册成功""用户名或密码错误" |
| `ip` | string | 客户端 IP | 默认取 `remote_addr`；仅 `TRUST_PROXY_HEADERS=1` 时取 `X-Forwarded-For` 第一段 |
| `user_agent` | string/null | 客户端标识 | 截断到 255 字符 |
| `request_id` | string/null | 请求 ID | 同一次请求的多条日志可串联排查 |

`operate_type` 枚举（前端筛选下拉框直接用这些值）：

| 值 | 含义 |
|----|------|
| `REGISTER` | 用户注册 |
| `LOGIN` | 用户登录 |
| `LOGIN_FAIL` | 登录失败 |
| `CREATE_REPORT` | 生成检测报告 |
| `DELETE_REPORT` | 删除检测报告 |

> 敏感信息禁止入日志：密码、token、完整 Cookie 一律不得写入 `detail`，脱敏由 `write_log()` 统一处理。

### 2.9 输入校验与安全约束（后端必须做，不能只靠前端）

1. **所有入参后端全量校验**：类型、长度、取值范围、枚举、格式。前端校验只是体验优化，可被绕过。
2. **防 SQL 注入**：全部使用 SQLAlchemy ORM 参数化查询（`filter_by` / `filter`），**禁止任何 f-string / 字符串拼接 SQL**。日志的 `keyword` 模糊查询也必须走参数化，并对 `%`、`_` 做转义。
3. **防 XSS**：后端只返回 JSON，不返回 HTML 片段；前端插入用户内容一律用 `textContent`，禁止 `innerHTML`。
4. **防暴力破解**：`/api/auth/login` 限流，同一 IP 每分钟最多 5 次失败尝试，超出返回 429。
5. **防扫描器滥用**：`/api/scanner/scan` 限流，同一用户/IP 每分钟最多 10 次，超出返回 429。
6. **防 SSRF（URL 检测接口的重点）**：
   - 只允许 `http` / `https` 协议；
   - 拒绝回环与内网地址：`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`、`::1`、`localhost`；
   - 域名解析后再校验一次真实 IP（防 DNS 重绑定）；
   - 跟随重定向后需对最终地址做同样的校验。
7. **密码**：只存哈希，永不返回、永不写日志；长度 6-32，不做 trim（前后空格算密码的一部分）。
8. **CORS**：开发环境可放开；上线必须改成白名单 origin，不能用 `*` 搭配凭证。

### 2.10 前端降级策略矩阵（对应"后端可插拔"设计）

| 后端状态 | 前端表现 |
|---------|---------|
| `/api/health` 请求失败 | 顶部提示"离线模式"，功能3 显示"检测服务暂不可用"，其余页面照常 |
| 进度接口 401 / 网络失败 | 进度读写走 `localStorage`，提示"当前进度仅保存在本机" |
| 登录/注册 500 | 提示"服务暂时不可用，可继续以游客身份使用" |
| 检测接口 503 | 只禁用"开始检测"按钮，不影响其他页面 |
| 检测接口超时（>15s） | 提示"检测超时，请换一个网址重试"，前端 `timeout` 建议设 15s |

---

## 三、接口详情

---

### 3.1 用户注册

- **接口名称**：用户注册
- **接口描述**：创建新账号，成功后直接返回 token，前端可免二次登录。
- **方法 / 路径**：`POST /api/auth/register`
- **需登录**：否

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| body | `username` | string | 是 | 3-20 位，仅允许字母、数字、下划线：`^[A-Za-z0-9_]+$`，前后空格会被去除 |
| body | `password` | string | 是 | 6-32 位，不做 trim，不允许与用户名相同 |

**请求示例**

```json
{ "username": "zhangsan", "password": "abc123456" }
```

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "注册成功",
  "data": {
    "user": {
      "id": 1,
      "username": "zhangsan",
      "role": "user",
      "created_at": "2026-11-18 10:00:00"
    },
    "token": "1.1763424800.9f2c4a7b1e8d3c5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b"
  }
}
```

**错误示例**

参数缺失（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "username", "message": "用户名不能为空" },
    { "field": "password", "message": "密码不能为空" }
  ]
}
```

用户名格式不合法（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "username", "message": "用户名只能包含字母、数字、下划线，长度 3-20" }
  ]
}
```

用户名已存在（HTTP 409）：

```json
{
  "code": 409,
  "message": "用户名已被占用",
  "data": null
}
```

---

### 3.2 用户登录

- **接口名称**：用户登录
- **接口描述**：校验账号密码，返回 token 与用户信息。
- **方法 / 路径**：`POST /api/auth/login`
- **需登录**：否

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| body | `username` | string | 是 | 1-20 位 |
| body | `password` | string | 是 | 1-32 位 |

**请求示例**

```json
{ "username": "zhangsan", "password": "abc123456" }
```

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "user": {
      "id": 1,
      "username": "zhangsan",
      "role": "user",
      "created_at": "2026-11-18 10:00:00"
    },
    "token": "1.1763424800.9f2c4a7b1e8d3c5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b"
  }
}
```

**错误示例**

登录失败（HTTP 401）—— 用户名不存在、密码错误**统一返回同一句文案**，防止攻击者枚举账号：

```json
{
  "code": 401,
  "message": "用户名或密码错误",
  "data": null
}
```

参数缺失（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "password", "message": "密码不能为空" }
  ]
}
```

触发限流（HTTP 429）：

```json
{
  "code": 429,
  "message": "登录尝试过于频繁，请 1 分钟后再试",
  "data": null
}
```

---

### 3.3 获取当前用户信息

- **接口名称**：获取当前登录用户
- **接口描述**：页面刷新后用于恢复登录态；也用于判断 token 是否仍有效。
- **方法 / 路径**：`GET /api/auth/me`
- **需登录**：是

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| header | `Authorization` | string | 是 | `Bearer <token>` |

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "zhangsan",
    "role": "user",
    "created_at": "2026-11-18 10:00:00"
  }
}
```

**错误示例**

未登录 / token 过期（HTTP 401）：

```json
{
  "code": 401,
  "message": "未登录或登录已过期",
  "data": null
}
```

用户已被删除（HTTP 404）：

```json
{
  "code": 404,
  "message": "用户不存在",
  "data": null
}
```

---

### 3.4 保存学习进度（已停用，不要对接）

> ⚠️ 这是旧需求的接口，当前平台没有学习进度页面，`app.py` 已不再注册该蓝图。
> 文件审计请直接看第八章的 `/api/reports/*`。

- **接口名称**：保存学习进度
- **接口描述**：登录用户保存一次测验结果或知识点打卡记录。
- **方法 / 路径**：`POST /api/progress/save`
- **需登录**：是（未登录返回 401，前端转存 localStorage）

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| body | `quiz_name` | string | 是 | 1-128 位，去除首尾空格后不能为空 |
| body | `score` | int | 是 | 0 ≤ score ≤ max_score |
| body | `max_score` | int | 否 | 默认 100，范围 1-1000 |
| body | `knowledge_points` | array[string] | 否 | 最多 50 项，每项 ≤ 50 字符；省略表示本次不记录知识点 |

**请求示例**

```json
{
  "quiz_name": "SQL 注入基础",
  "score": 80,
  "max_score": 100,
  "knowledge_points": ["SQL注入", "参数化查询"]
}
```

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "保存成功",
  "data": {
    "id": 12,
    "quiz_name": "SQL 注入基础",
    "score": 80,
    "max_score": 100,
    "knowledge_points": ["SQL注入", "参数化查询"],
    "completed_at": "2026-11-18 10:05:00"
  }
}
```

**错误示例**

分数越界（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "score", "message": "得分必须在 0 到 max_score 之间" }
  ]
}
```

未登录（HTTP 401）：

```json
{
  "code": 401,
  "message": "未登录，进度未保存到服务器",
  "data": null
}
```

类型错误（HTTP 400）—— 例如把 `score` 传成字符串 `"80"`：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "score", "message": "score 必须是整数" }
  ]
}
```

---

### 3.5 查询学习进度列表（已停用，不要对接）

- **接口名称**：查询我的学习进度
- **接口描述**：按时间倒序返回当前用户的所有进度记录，支持分页。
- **方法 / 路径**：`GET /api/progress/list`
- **需登录**：是

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 默认 | 约束 |
|------|--------|------|------|------|------|
| header | `Authorization` | string | 是 | — | `Bearer <token>` |
| query | `page` | int | 否 | 1 | ≥ 1 |
| query | `pagesize` | int | 否 | 10 | 1-100 |

**请求示例**

```
GET /api/progress/list?page=1&pagesize=10
Authorization: Bearer 1.1763424800.9f2c...
```

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 12,
        "quiz_name": "SQL 注入基础",
        "score": 80,
        "max_score": 100,
        "knowledge_points": ["SQL注入", "参数化查询"],
        "completed_at": "2026-11-18 10:05:00"
      },
      {
        "id": 11,
        "quiz_name": "XSS 防护",
        "score": 90,
        "max_score": 100,
        "knowledge_points": null,
        "completed_at": "2026-11-17 20:31:09"
      }
    ],
    "total": 2,
    "page": 1,
    "pagesize": 10,
    "total_pages": 1
  }
}
```

**错误示例**

分页参数非法（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "page", "message": "page 必须是大于等于 1 的整数" }
  ]
}
```

未登录（HTTP 401）：

```json
{
  "code": 401,
  "message": "未登录",
  "data": null
}
```

---

### 3.6 删除进度记录（已停用，不要对接）

- **接口名称**：删除学习进度
- **接口描述**：删除当前用户名下的一条进度记录。只能删自己的，删别人的按"不存在"处理。
- **方法 / 路径**：`DELETE /api/progress/{id}`
- **需登录**：是

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| path | `id` | int | 是 | 正整数，进度记录 ID |
| header | `Authorization` | string | 是 | `Bearer <token>` |

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "删除成功",
  "data": null
}
```

**错误示例**

记录不存在或不属于当前用户（HTTP 404）：

```json
{
  "code": 404,
  "message": "记录不存在或无权删除",
  "data": null
}
```

路径参数不是数字（HTTP 404，由路由匹配失败产生）：

```json
{
  "code": 404,
  "message": "接口不存在",
  "data": null
}
```

---

### 3.7 URL 安全检测

- **接口名称**：URL 安全检测
- **接口描述**：对目标网址做三项检查——HTTP 安全响应头、SSL 证书、常见端口开放情况，返回 0-100 评分、等级与改进建议。未登录也可使用，但不保存历史。
- **方法 / 路径**：`POST /api/scanner/scan`
- **需登录**：否

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| body | `url` | string | 是 | 1-512 位；省略协议时后端自动补 `https://`；仅允许 http/https；**禁止内网、回环、保留地址** |

**请求示例**

```json
{ "url": "example.com" }
```

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "检测完成",
  "data": {
    "report_no": "a1b2c3d4e5f60718",
    "url": "https://example.com",
    "score": 78,
    "grade": "B 良好",
    "created_at": "2026-11-18 10:12:33",
    "details": {
      "http_headers": {
        "HSTS": { "status": "✅ 已设置", "value": "max-age=31536000", "desc": "强制使用 HTTPS 加密传输" },
        "X-Frame-Options": { "status": "❌ 缺失", "value": null, "desc": "防止页面被 iframe 嵌入（防点击劫持）", "suggestion": "建议添加 X-Frame-Options 响应头" },
        "CSP": { "status": "❌ 缺失", "value": null, "desc": "内容安全策略，限制页面可以加载哪些资源", "suggestion": "建议添加 Content-Security-Policy 响应头" }
      },
      "ssl_certificate": {
        "status": "✅ 证书正常",
        "subject": "example.com",
        "issuer": "DigiCert Inc",
        "not_before": "Oct 10 00:00:00 2026 GMT",
        "not_after": "Oct 10 23:59:59 2027 GMT",
        "version": 3
      },
      "ports": {
        "80": { "name": "HTTP", "status": "🔓 开放", "risk": "低" },
        "443": { "name": "HTTPS", "status": "🔓 开放", "risk": "低" },
        "21": { "name": "FTP", "status": "🔒 关闭" }
      }
    },
    "suggestions": [
      "建议添加 X-Frame-Options 响应头",
      "建议添加 Content-Security-Policy 响应头"
    ]
  }
}
```

**字段说明**

| 字段 | 说明 |
|------|------|
| `report_no` | 报告编号。**未登录检测时为 `null`**（游客报告不落库），前端需兼容 |
| `score` | 0-100 整数 |
| `grade` | `A 优秀 / B 良好 / C 及格 / D 较差 / F 危险` |
| `details.*.status` | 固定文案，用于直接展示 |
| `suggestions` | 数组，至少 1 项；无问题时为 `["✅ 未发现明显安全问题，继续保持！"]` |

**错误示例**

参数缺失（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "url", "message": "网址不能为空" }
  ]
}
```

URL 非法或指向内网（HTTP 400）：

```json
{
  "code": 400,
  "message": "网址不合法或不允许检测内网地址",
  "data": null,
  "errors": [
    { "field": "url", "message": "仅支持公网 http/https 地址" }
  ]
}
```

触发限流（HTTP 429）：

```json
{
  "code": 429,
  "message": "检测过于频繁，请稍后再试",
  "data": null
}
```

检测服务自身不可用（HTTP 503）：

```json
{
  "code": 503,
  "message": "检测服务暂不可用",
  "data": null
}
```

> 注意区分：**目标网站打不开**不算接口错误，仍返回 200，只是评分低、`details` 中带 `_error` 说明，前端正常渲染即可。

**目标网站不可达的返回示例（仍是 200）**

```json
{
  "code": 200,
  "message": "检测完成",
  "data": {
    "report_no": null,
    "url": "https://not-exist-domain-xyz.com",
    "score": 30,
    "grade": "F 危险",
    "details": {
      "http_headers": { "_error": "无法连接到目标网站" },
      "ssl_certificate": { "status": "⚠️ 检测失败", "info": "域名解析失败" },
      "ports": {}
    },
    "suggestions": ["目标网站无法访问，请确认网址是否正确"]
  }
}
```

---

### 3.8 查询检测历史

- **接口名称**：URL 检测历史
- **接口描述**：按时间倒序返回当前用户的检测记录，支持分页。
- **方法 / 路径**：`GET /api/scanner/history`
- **需登录**：是

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 默认 | 约束 |
|------|--------|------|------|------|------|
| header | `Authorization` | string | 是 | — | `Bearer <token>` |
| query | `page` | int | 否 | 1 | ≥ 1 |
| query | `pagesize` | int | 否 | 10 | 1-100 |

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "report_no": "b7c8d9e0f1a2b3c4",
        "url": "https://example.com",
        "score": 78,
        "grade": "B 良好",
        "created_at": "2026-11-18 10:12:33"
      }
    ],
    "total": 1,
    "page": 1,
    "pagesize": 10,
    "total_pages": 1
  }
}
```

> 列表只返回摘要字段；`details` 体积大，需要详情时前端调用 `POST /api/scanner/scan` 重新检测，或后续加详情接口（本期不做）。

**错误示例**

未登录（HTTP 401）：

```json
{
  "code": 401,
  "message": "未登录",
  "data": null
}
```

---

### 3.9 查询审计日志（仅管理员）

- **接口名称**：查询审计日志
- **接口描述**：管理员按条件分页查询全部操作日志。日志量会持续增长，**必须分页，禁止一次性全量返回**；应用层**不提供删除日志的接口**。
- **方法 / 路径**：`GET /api/audit-logs`
- **需登录**：是，且 `role` 必须为 `admin`；普通用户访问返回 403

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 默认 | 约束 |
|------|--------|------|------|------|------|
| header | `Authorization` | string | 是 | — | `Bearer <token>` |
| query | `page` | int | 否 | 1 | ≥ 1 |
| query | `pagesize` | int | 否 | 10 | 1-100，**上限强制 100** |
| query | `action` | string | 否 | — | 必须是 `operate_type` 枚举值之一，否则 400 |
| query | `operator` | string | 否 | — | 按操作人模糊匹配 |
| query | `result` | string | 否 | — | `SUCCESS` / `FAIL` |
| query | `start_time` | string | 否 | — | `YYYY-MM-DD HH:mm:ss`，闭区间 |
| query | `end_time` | string | 否 | — | `YYYY-MM-DD HH:mm:ss`，闭区间；需 ≥ start_time |
| query | `keyword` | string | 否 | — | 1-50 位，模糊匹配 `message` / `detail`；后端转义 `%` `_` |

**请求示例**

```
GET /api/audit-logs?page=1&pagesize=20&action=LOGIN&result=FAIL
Authorization: Bearer 1.1763424800.9f2c...
```

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "log_id": 1024,
        "request_id": "5f1c9a7b8e2d4c6a9b0f3e2d1c4a5b6e",
        "operator_id": 1,
        "operator": "zhangsan",
        "operate_time": "2026-11-18 10:12:33",
        "operate_type": "LOGIN_FAIL",
        "target_type": "session",
        "target_id": null,
        "detail": "{\"username\": \"zhangsan\"}",
        "result": "FAIL",
        "error_code": 401,
        "message": "用户名或密码错误",
        "ip": "203.0.113.5",
        "user_agent": "Mozilla/5.0 ..."
      },
      {
        "log_id": 1023,
        "request_id": "8a2b1c3d4e5f60718293a4b5c6d7e8f9",
        "operator_id": 1,
        "operator": "zhangsan",
        "operate_time": "2026-11-18 10:05:00",
        "operate_type": "REGISTER",
        "target_type": "user",
        "target_id": "1",
        "detail": "{\"username\": \"zhangsan\", \"role\": \"user\"}",
        "result": "SUCCESS",
        "error_code": null,
        "message": "注册成功",
        "ip": "203.0.113.5",
        "user_agent": "Mozilla/5.0 ..."
      }
    ],
    "total": 2,
    "page": 1,
    "pagesize": 20,
    "total_pages": 1
  }
}
```

**错误示例**

`action` 不在枚举内（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "action", "message": "action 必须是 REGISTER/LOGIN/LOGIN_FAIL/CREATE_REPORT/DELETE_REPORT 之一" }
  ]
}
```

普通用户访问（HTTP 403）：

```json
{
  "code": 403,
  "message": "无权限访问",
  "data": null
}
```

时间区间非法（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "end_time", "message": "结束时间不能早于开始时间" }
  ]
}
```

`pagesize` 非法（HTTP 400）：

```json
{
  "code": 400,
  "message": "参数校验失败",
  "data": null,
  "errors": [
    { "field": "pagesize", "message": "pagesize 必须是 1-100 的整数" }
  ]
}
```

未登录（HTTP 401）：

```json
{
  "code": 401,
  "message": "未登录",
  "data": null
}
```

---

### 3.10 探活

- **接口名称**：探活
- **接口描述**：最轻量的可用性检查，不查数据库、不写日志。前端启动时先打这个接口。
- **方法 / 路径**：`GET /api/ping`
- **需登录**：否

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "pong",
  "data": { "time": "2026-11-18 10:00:00" }
}
```

---

### 3.11 健康检查

- **接口名称**：服务健康检查
- **接口描述**：在探活基础上额外检查数据库连通性。失败即进入离线降级模式。
- **方法 / 路径**：`GET /api/health`
- **需登录**：否

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "后端在线",
  "data": {
    "status": "ok",
    "db": "ok",
    "version": "1.0.0"
  }
}
```

**服务异常（HTTP 503）**

```json
{
  "code": 503,
  "message": "服务异常",
  "data": {
    "status": "degraded",
    "db": "error",
    "version": "1.0.0"
  }
}
```

---

## 四、后端入参校验规则总表（实现时逐条对照）

| 参数 | 类型 | 校验规则 | 失败状态码 |
|------|------|---------|-----------|
| `username`（注册） | string | 必填；trim 后 3-20 位；`^[A-Za-z0-9_]+$` | 400 |
| `password`（注册） | string | 必填；6-32 位；不 trim；不得等于用户名 | 400 |
| `username`（登录） | string | 必填；1-20 位 | 400 |
| `password`（登录） | string | 必填；1-32 位 | 400 |
| `quiz_name` | string | 必填；trim 后 1-128 位 | 400 |
| `score` | int | 必填；整数；0 ≤ score ≤ max_score | 400 |
| `max_score` | int | 可选；默认 100；1-1000 | 400 |
| `knowledge_points` | array | 可选；最多 50 项；每项 string ≤ 50 字符 | 400 |
| `url` | string | 必填；1-512 位；可补全协议；仅 http/https；禁止内网/回环/保留地址 | 400 |
| `page` | int | 可选；默认 1；≥ 1；非整数报错 | 400 |
| `pagesize` | int | 可选；默认 10；1-100；超出上限按 100 | 400 |
| `operate_type` | string | 可选；必须命中枚举 | 400 |
| `start_time` / `end_time` | string | 可选；格式 `YYYY-MM-DD HH:mm:ss`；end ≥ start | 400 |
| `keyword` | string | 可选；1-50 位；转义 `%` `_` | 400 |
| `id`（路径） | int | 正整数 | 404 |

---

## 五、常见坑清单（前后端各看一遍）

### 前端容易踩的
1. **`pageSize` 写成驼峰**：后端只认 `pagesize`，写错等于没传，会拿到默认 10 条，排查很久。
2. **可选参数传 `null` 占位**：约定是不用就不传 key，别传 `null` / `"null"` / `"undefined"`。
3. **忘记 `Content-Type: application/json`**：POST 会拿不到 body，直接 400。
4. **分数传字符串 `"80"`**：类型校验会拒绝。
5. **中文网址没 `encodeURIComponent`**：查询参数会被截断。
6. **401 后无限重试**：401 要立刻清 token 并降级，不能循环请求。
7. **只看 HTTP 200 不判断 `code`**：错误响应也可能是 4xx，必须判断 `code`。
8. **`error.message` 自己拼文案**：直接展示后端 `message`，避免前后端文案不一致。
9. **`knowledge_points` 少判空**：该字段可能为 `null`，渲染前要兜底成 `[]`。
10. **`report_no` 判空**：未登录检测时它是 `null`。
11. **检测按钮不防重复点击**：单次检测最长十几秒，必须 loading + 禁用。
12. **`innerHTML` 渲染检测结果或日志内容**：一律 `textContent`，防 XSS。

### 后端容易踩的
1. **错误响应返回 HTTP 200**：必须让 HTTP 状态码与 `code` 一致。
2. **登录失败区分"用户不存在/密码错误"**：会泄露账号是否存在，统一文案。
3. **列表接口不分页**：日志、历史必须 `page/pagesize`，且 `pagesize` 有上限。
4. **用 f-string 拼 SQL**：一律 ORM 参数化；`keyword` 的 LIKE 要转义通配符。
5. **`knowledge_points` 直接返回数据库里的 JSON 字符串**：返回给前端时必须是数组。
6. **统计总数时忘了加同样的筛选条件**：`total` 必须与 `list` 使用同一套 where。
7. **URL 检测不防 SSRF**：不校验就会变成内网端口扫描器。
8. **把密码/token 写进日志**：审计日志只记业务行为。
9. **`db.session` 异常不回滚**：commit 失败要 `rollback()`，否则后续请求会连锁报错。
10. **时间字段各自格式化**：统一 `%Y-%m-%d %H:%M:%S`，不要再出现 ISO 带 T 的格式。

---

## 六、实现进度（截至 v1.2）

| 能力 | 状态 | 说明 |
|------|------|------|
| 用户表 / 审计表 / 报告表 | ✅ 已完成 | `users`、`audit_logs`、`reports` |
| 报告表兼容文件审计 | ✅ 已完成 | `report_type` 区分 `file` / `url`，预留 `file_name`、`stat` |
| 后端启动导入 | ✅ 已修复 | `app.py` 原本导入不存在的 `routes.progress`，已改为实际的 `routes.history` |
| `/api/ping`、`/api/health` | ✅ 已完成 | 健康检查含数据库连通性 |
| 注册 / 登录 / me | ✅ 已完成 | 参数校验、统一失败文案、写审计日志 |
| 密码存储 | ✅ 已完成 | werkzeug 加盐哈希，兼容旧数据 |
| 登录 token | ✅ 已完成 | HMAC-SHA256 签名，客户端无法伪造 user_id |
| `/api/audit-logs` | ✅ 已完成 | 仅 admin，分页 + 筛选，无删除接口 |
| 进度 / 检测历史分页 | ✅ 已完成 | 统一 `page/pagesize` 结构 |
| HTTP 状态码对齐 | ✅ 已完成 | 与响应体 `code` 一致 |
| 日志保留与清理 | ✅ 已完成 | `manage.py audit-cleanup`，支持归档 + VACUUM |
| 日志写入脱敏 | ✅ 已完成 | 白名单字段 + 长度截断 + URL 去查询串 |
| 文件审计结果保存 / 历史 | ✅ 已完成 | `/api/reports/*`，存 vul_list/stat/scan_meta |
| 旧学习进度接口 | ⬜ 已停用 | `/api/progress/*` 不再注册，数据库也不建 progress 表 |
| 接口限流 | ⬜ 待实现 | 登录 5 次/分钟、检测 10 次/分钟 |
| SSRF 防护 | ⬜ 待实现 | 拒绝内网/回环/保留地址 |
| 报告详情接口 | ✅ 已完成 | `GET /api/reports/{report_no}`，仅本人可见，返回 vul_list |

---

## 七、前端请求封装建议（直接可用）

```javascript
// config.js
const BASE_URL = 'http://127.0.0.1:5000';

// request.js
async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // 网络层失败 = 后端不可用 → 走降级
    return { code: 0, message: '网络异常，已进入离线模式', data: null };
  }

  const json = await res.json().catch(() => ({ code: 500, message: '响应格式错误', data: null }));

  if (json.code === 401) {
    localStorage.removeItem('token');
    // 触发全局登出提示，但不要中断页面其他功能
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return json;
}
```

调用示例：

```javascript
// 登录
const r1 = await request('/api/auth/login', {
  method: 'POST',
  body: { username, password },
  auth: false,
});
if (r1.code === 200) localStorage.setItem('token', r1.data.token);

// 分页查日志（管理员；省略不需要的可选参数）
const r2 = await request(`/api/audit-logs?page=1&pagesize=20&action=LOGIN`);

// 检测（不传 null）
const r3 = await request('/api/scanner/scan', {
  method: 'POST',
  body: { url: urlInput.value.trim() },
  auth: false,
});
```

---

## 八、文件审计报告接口（已实现）

> 用途：把前端 `scan.js` 的扫描结果（`vul_list` / `stat` / `scan_meta`）存到 `reports` 表，`report_type = "file"`。
> 登录用户才能保存；未登录时前端继续走 `localStorage` 降级，不调用这些接口。
> 代码位置：`routes/reports.py` + `services/report_service.py`。

### 8.1 保存文件审计结果

- **方法 / 路径**：`POST /api/reports/save`
- **需登录**：是

**请求参数**

| 位置 | 参数名 | 类型 | 必填 | 约束 |
|------|--------|------|------|------|
| header | `Authorization` | string | 是 | `Bearer <token>` |
| body | `file_name` | string | 否 | 1-255 位；不传则自动取 `scan_meta.file_name` |
| body | `stat` | object | 是 | `{high, mid, low, total}`，均为非负整数，且 `high+mid+low === total` |
| body | `vul_list` | array | 是 | 每条至少含 `vid`、`vname`、`level`、`line`、`hit_content`、`description`、`suggestion`、`file_name` |
| body | `scan_meta` | object | 否 | 含 `total_lines`、`rule_count`、`rule_error_count`、`cost_ms`、`scan_time` |
| body | `suggestions` | array | 否 | 汇总后的整改建议，最多 50 条 |

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "保存成功",
  "data": {
    "report_no": "b7c8d9e0f1a2b3c4",
    "report_type": "file",
    "file_name": "sshd_config",
    "stat": { "high": 2, "mid": 1, "low": 0, "total": 3 },
    "created_at": "2026-11-19 10:00:00"
  }
}
```

### 8.2 我的报告列表

- **方法 / 路径**：`GET /api/reports?report_type=file&page=1&pagesize=10`
- **需登录**：是
- **入参**：`report_type`（可选，`file` / `url`）、`page`、`pagesize`
- **出参**：标准分页结构，`list` 中的每条为报告摘要（同 8.1 的 `data` 字段）

### 8.3 报告详情

- **方法 / 路径**：`GET /api/reports/{report_no}`
- **需登录**：是，且只能查看自己的报告
- **出参**：报告摘要 + `details`（文件审计时为 `vul_list`）+ `suggestions`

### 8.4 删除我的报告

- **方法 / 路径**：`DELETE /api/reports/{report_no}`
- **需登录**：是，且只能删除自己的报告
- **说明**：删除的是业务报告，不是审计日志；审计日志仍然不提供任何删除接口。

---

**文档版本**：v1.2（阶段一已与代码对齐；阶段二接口仅规划）
**维护约定**：接口有变更时，先改本文档，再改代码，最后通知前端。
