# 事件系统

事件系统允许 mom 通过定时或即时事件触发。事件是 `workspace/events/` 目录下的 JSON 文件。Harness（运行框架）会监控该目录，并在事件到期时执行它们。

## 事件类型

### Immediate（即时）

Harness 发现文件后立即执行。用于 mom 编写的程序来发送外部事件信号（webhooks、文件变更、API 回调等）。

```json
{
  "type": "immediate",
  "channelId": "C123ABC",
  "text": "New support ticket received: #12345"
}
```

执行后，文件会被删除。过期判断基于文件 mtime（参见启动行为）。

### One-Shot（单次）

在指定的日期/时间执行一次。用于提醒、定时任务或延迟操作。

```json
{
  "type": "one-shot",
  "channelId": "C123ABC",
  "text": "Remind Mario about the dentist appointment",
  "at": "2025-12-15T09:00:00+01:00"
}
```

`at` 时间戳必须包含时区偏移。执行后，文件会被删除。

### Periodic（周期）

按 cron 调度重复执行。用于每日摘要、每周报告或定期检查等周期性任务。

```json
{
  "type": "periodic",
  "channelId": "C123ABC",
  "text": "Check inbox and post summary",
  "schedule": "0 9 * * 1-5",
  "timezone": "Europe/Vienna"
}
```

`schedule` 字段使用标准 cron 语法。`timezone` 字段使用 IANA 时区名称。文件会持续存在，直到被 mom 或创建它的程序显式删除。

#### Cron 格式

`minute hour day-of-month month day-of-week`

示例：
- `0 9 * * *` — 每天 9:00
- `0 9 * * 1-5` — 工作日 9:00
- `30 14 * * 1` — 每周一 14:30
- `0 0 1 * *` — 每月 1 日午夜
- `*/15 * * * *` — 每 15 分钟

## 时区处理

所有时间戳必须包含时区信息：
- 对于 `one-shot`：使用带偏移的 ISO 8601 格式（例如 `2025-12-15T09:00:00+01:00`）
- 对于 `periodic`：使用带 IANA 时区名称的 `timezone` 字段（例如 `Europe/Vienna`、`America/New_York`）

Harness 在主机进程的时区中运行。当用户提到时间但未指定时区时，假设使用 Harness 时区。

## Harness 行为

### 启动

1. 扫描 `workspace/events/` 中的所有 `.json` 文件
2. 解析每个事件文件
3. 对于每个事件：
   - **Immediate**：检查文件 mtime。如果文件是在 Harness 未运行时创建的（mtime < Harness 启动时间），则视为过期。删除而不执行。否则，立即执行并删除。
   - **One-shot**：如果 `at` 已过期，删除文件。如果 `at` 在未来，设置 `setTimeout` 在指定时间执行。
   - **Periodic**：设置 cron 任务（使用 `croner` 库）按指定计划执行。如果 Harness 停机期间错过了计划时间，不进行补偿执行。等待下一个计划时间。

### 文件系统监控

Harness 使用 `fs.watch()` 监控 `workspace/events/`，带 100ms 防抖。

**新增文件：**
- 解析事件
- 根据类型：立即执行、设置 `setTimeout` 或设置 cron 任务

**修改现有文件：**
- 取消该文件现有的任何 timer/cron
- 重新解析并设置（允许重新调度）

**删除文件：**
- 取消该文件现有的任何 timer/cron

### 解析错误

如果 JSON 文件解析失败：
1. 使用指数退避重试（100ms、200ms、400ms）
2. 如果重试后仍失败，删除文件并将错误记录到控制台

### 执行错误

如果 agent 在处理事件时出错：
1. 向频道发送错误消息
2. 删除事件文件（对于 immediate/one-shot）
3. 不重试

## 队列集成

事件与 `SlackBot` 中现有的 `ChannelQueue` 集成：

- 新方法：`SlackBot.enqueueEvent(event: SlackEvent)` — 始终入队，不会因"正在工作"而拒绝
- 每个频道最多可排队 5 个事件。如果队列已满，丢弃并记录到控制台。
- 用户 @mom 提及保持当前行为：如果 agent 忙碌则拒绝并显示"Already working"消息

当事件触发时：
1. 创建带有格式化消息的合成 `SlackEvent`
2. 调用 `slack.enqueueEvent(event)`
3. 如果 agent 忙碌，事件在队列中等待，空闲时处理

## 事件执行

当事件出队并执行时：

1. 发送状态消息："_Starting event: {filename}_"
2. 使用以下消息调用 agent：`[EVENT:{filename}:{type}:{schedule}] {text}`
   - 对于 immediate：`[EVENT:webhook-123.json:immediate] New support ticket`
   - 对于 one-shot：`[EVENT:dentist.json:one-shot:2025-12-15T09:00:00+01:00] Remind Mario`
   - 对于 periodic：`[EVENT:daily-inbox.json:periodic:0 9 * * 1-5] Check inbox`
3. 执行后：
   - 如果响应是 `[SILENT]`：删除状态消息，不向 Slack 发送任何内容
   - Immediate 和 one-shot：删除事件文件
   - Periodic：保留文件，事件将按计划再次触发

## 静默完成

对于检查活动的周期性事件（收件箱、通知等），mom 可能发现没有可报告的内容。为避免刷屏频道，mom 可以仅响应 `[SILENT]`。这会删除"Starting event..."状态消息，并且不向 Slack 发送任何内容。

示例：一个周期性事件每 15 分钟检查新邮件。如果没有新邮件，mom 响应 `[SILENT]`。如果有新邮件，mom 发布摘要。

## 文件命名

事件文件应具有以 `.json` 结尾的描述性名称：
- `webhook-12345.json`（immediate）
- `dentist-reminder-2025-12-15.json`（one-shot）
- `daily-inbox-summary.json`（periodic）

文件名用作跟踪计时器的标识符，并出现在事件消息中。避免使用特殊字符。

## 实现

### 文件

- `src/events.ts` — 事件解析、计时器管理、fs 监控
- `src/slack.ts` — 向 `ChannelQueue` 添加 `enqueueEvent()` 方法和 `size()`
- `src/main.ts` — 启动时初始化事件监控器
- `src/agent.ts` — 使用事件文档更新系统提示

### 核心组件

```typescript
// events.ts

interface ImmediateEvent {
  type: "immediate";
  channelId: string;
  text: string;
}

interface OneShotEvent {
  type: "one-shot";
  channelId: string;
  text: string;
  at: string; // ISO 8601 with timezone offset
}

interface PeriodicEvent {
  type: "periodic";
  channelId: string;
  text: string;
  schedule: string; // cron syntax
  timezone: string; // IANA timezone
}

type MomEvent = ImmediateEvent | OneShotEvent | PeriodicEvent;

class EventsWatcher {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private crons: Map<string, Cron> = new Map();
  private startTime: number;
  
  constructor(
    private eventsDir: string,
    private slack: SlackBot,
    private onError: (filename: string, error: Error) => void
  ) {
    this.startTime = Date.now();
  }
  
  start(): void { /* scan existing, setup fs.watch */ }
  stop(): void { /* cancel all timers/crons, stop watching */ }
  
  private handleFile(filename: string): void { /* parse, schedule */ }
  private handleDelete(filename: string): void { /* cancel timer/cron */ }
  private execute(filename: string, event: MomEvent): void { /* enqueue */ }
}
```

### 依赖

- `croner` — 支持时区的 Cron 调度

## 系统提示部分

以下内容应添加到 mom 的系统提示中：

```markdown
## Events

You can schedule events that wake you up at specific times or when external things happen. Events are JSON files in `/workspace/events/`.

### Event Types

**Immediate** — Triggers as soon as harness sees the file. Use in scripts/webhooks to signal external events.
```json
{"type": "immediate", "channelId": "C123", "text": "New GitHub issue opened"}
```

**One-shot** — Triggers once at a specific time. Use for reminders.
```json
{"type": "one-shot", "channelId": "C123", "text": "Remind Mario about dentist", "at": "2025-12-15T09:00:00+01:00"}
```

**Periodic** — Triggers on a cron schedule. Use for recurring tasks.
```json
{"type": "periodic", "channelId": "C123", "text": "Check inbox and summarize", "schedule": "0 9 * * 1-5", "timezone": "Europe/Vienna"}
```

### Cron Format

`minute hour day-of-month month day-of-week`

- `0 9 * * *` = daily at 9:00
- `0 9 * * 1-5` = weekdays at 9:00
- `30 14 * * 1` = Mondays at 14:30
- `0 0 1 * *` = first of each month at midnight

### Timezones

All `at` timestamps must include offset (e.g., `+01:00`). Periodic events use IANA timezone names. The harness runs in ${TIMEZONE}. When users mention times without timezone, assume ${TIMEZONE}.

### Creating Events

```bash
cat > /workspace/events/dentist-reminder.json << 'EOF'
{"type": "one-shot", "channelId": "${CHANNEL}", "text": "Dentist tomorrow", "at": "2025-12-14T09:00:00+01:00"}
EOF
```

### Managing Events

- List: `ls /workspace/events/`
- View: `cat /workspace/events/foo.json`
- Delete/cancel: `rm /workspace/events/foo.json`

### When Events Trigger

You receive a message like:
```
[EVENT:dentist-reminder.json:one-shot:2025-12-14T09:00:00+01:00] Dentist tomorrow
```

Immediate and one-shot events auto-delete after triggering. Periodic events persist until you delete them.

### Debouncing

When writing programs that create immediate events (email watchers, webhook handlers, etc.), always debounce. If 50 emails arrive in a minute, don't create 50 immediate events. Instead:

- Collect events over a window (e.g., 30 seconds)
- Create ONE immediate event summarizing what happened
- Or just signal "new activity, check inbox" rather than per-item events

Bad:
```bash
# Creates event per email — will flood the queue
on_email() { echo '{"type":"immediate"...}' > /workspace/events/email-$ID.json; }
```

Good:
```bash
# Debounce: flag file + single delayed event  
on_email() {
  echo "$SUBJECT" >> /tmp/pending-emails.txt
  if [ ! -f /workspace/events/email-batch.json ]; then
    (sleep 30 && mv /tmp/pending-emails.txt /workspace/events/email-batch.json) &
  fi
}
```

Or simpler: use a periodic event to check for new emails every 15 minutes instead of immediate events.

### Limits

Maximum 5 events can be queued. Don't create excessive immediate or periodic events.
```