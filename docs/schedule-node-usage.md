# Schedule 节点使用文档

## 简介

Schedule 节点是 Agentflow 的**定时触发入口节点**，支持三种触发模式：

-   **Cron**：基于 cron 表达式周期触发（推荐）
-   **间隔执行**：每隔固定秒数触发一次
-   **延迟执行**：延迟指定秒数后触发一次

触发时，节点将上下文参数（触发时间、执行次数、用户自定义参数等）注入流程，下游节点可通过变量引用读取。

---

## 节点配置字段

| 字段           | 类型       | 说明                                       |
| -------------- | ---------- | ------------------------------------------ |
| 触发类型       | 选项       | `cron` / `interval` / `delay`              |
| Cron 表达式    | 字符串     | 标准 5 位 cron，如 `0 9 * * 1-5`           |
| 时区           | 字符串     | 如 `Asia/Shanghai`、`UTC`                  |
| 延迟（秒）     | 数字       | delay 模式：等待秒数后执行一次             |
| 初始延迟（秒） | 数字       | interval 模式：首次执行前的等待秒数        |
| 间隔（秒）     | 数字       | interval 模式：每次执行之间的间隔          |
| 最大执行次数   | 数字       | 0 = 无限制；达到上限后状态变为 `completed` |
| 上下文参数     | 键值对数组 | 每次触发时注入到上下文的静态参数           |

---

## 触发上下文结构

每次触发时，Schedule 节点的 `output.scheduleContext` 包含以下字段：

```json
{
    "scheduledAt": "2026-04-23T09:00:00.000Z",
    "executionCount": 42,
    "scheduleId": "abc-123",
    "scheduleType": "cron",
    "cronExpression": "0 9 * * 1-5",
    "key1": "用户自定义值1",
    "key2": "用户自定义值2"
}
```

**下游节点变量引用格式**：

```
{{ $output.scheduleAgentflow_0.output.scheduleContext.scheduledAt }}
{{ $output.scheduleAgentflow_0.output.scheduleContext.executionCount }}
{{ $output.scheduleAgentflow_0.output.scheduleContext.key1 }}
```

---

## 案例一：每天早上定时发送日报

**场景**：工作日每天 9:00，自动生成前一天数据摘要并发送邮件。

**流程**：

```
[Schedule] → [LLM] → [HTTP]
```

**Schedule 节点配置**：

| 字段        | 值                                                    |
| ----------- | ----------------------------------------------------- |
| 触发类型    | Cron                                                  |
| Cron 表达式 | `0 9 * * 1-5`                                         |
| 时区        | `Asia/Shanghai`                                       |
| 上下文参数  | `reportType = daily` / `recipient = team@company.com` |

**LLM 节点 System Prompt**：

```
你是一个日报生成助手。
当前触发时间：{{ $output.scheduleAgentflow_0.output.scheduleContext.scheduledAt }}
报告类型：{{ $output.scheduleAgentflow_0.output.scheduleContext.reportType }}
请生成今日工作日报摘要。
```

**HTTP 节点**：将 LLM 输出 POST 到邮件服务接口，收件人从 `scheduleContext.recipient` 读取。

---

## 案例二：每 5 分钟轮询监控告警

**场景**：每 5 分钟检查一次服务状态，异常时触发告警通知。

**流程**：

```
[Schedule] → [HTTP 检查] → [Condition] → [HTTP 告警]
```

**Schedule 节点配置**：

| 字段       | 值                                                       |
| ---------- | -------------------------------------------------------- |
| 触发类型   | 间隔执行                                                 |
| 初始延迟   | `0` 秒                                                   |
| 间隔       | `300` 秒                                                 |
| 上下文参数 | `service = payment-api` / `alertEmail = ops@company.com` |

**Condition 节点**：判断 HTTP 响应状态码是否异常，为真则走告警分支，调用钉钉/企业微信/邮件接口。

---

## 案例三：延迟 30 秒后执行一次性任务

**场景**：用户提交表单后，延迟 30 秒自动发送欢迎短信。

**Schedule 节点配置**：

| 字段       | 值                                       |
| ---------- | ---------------------------------------- |
| 触发类型   | 延迟执行                                 |
| 延迟       | `30` 秒                                  |
| 上下文参数 | `taskType = welcome` / `userId = U12345` |

> 执行完成后节点状态自动变为 `completed`，不再重复触发。

---

## 调度管理 API

调度在 **Agentflow 保存时自动注册**，无需手动创建。修改节点配置后重新保存即可更新调度。

| 操作             | 方法     | 路径                               |
| ---------------- | -------- | ---------------------------------- |
| 查看所有调度     | `GET`    | `/api/v1/schedules`                |
| 按 chatflow 筛选 | `GET`    | `/api/v1/schedules?chatflowId=xxx` |
| 查看单个调度     | `GET`    | `/api/v1/schedules/:id`            |
| 暂停调度         | `PATCH`  | `/api/v1/schedules/:id/pause`      |
| 恢复调度         | `PATCH`  | `/api/v1/schedules/:id/resume`     |
| 删除调度         | `DELETE` | `/api/v1/schedules/:id`            |

---

## 调度状态说明

| 状态        | 说明                                            |
| ----------- | ----------------------------------------------- |
| `active`    | 运行中，按计划触发                              |
| `paused`    | 已暂停，可手动恢复                              |
| `completed` | 已完成（达到最大执行次数，或 delay 类型执行后） |
| `error`     | 执行出错，已停止，需排查后手动恢复              |

---

## 注意事项

1. **Cron 表达式**使用标准 5 位格式（分 时 日 月 周），不支持秒级精度。
2. **时区**仅对 Cron 模式生效，delay/interval 使用服务器本地时间。
3. **服务重启后**，所有 `active` 状态的调度会从数据库自动重新加载并恢复运行。
4. **上下文参数**为静态值，每次触发传入相同内容；动态数据请在下游节点通过 HTTP/LLM 获取。
5. chatflow 删除后，关联的所有调度会自动清除。
