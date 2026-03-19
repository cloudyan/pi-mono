# pi-coding-agent 中文文档

> 原文：[packages/coding-agent/README.md](../../packages/coding-agent/README.md)

Pi 是一个极简终端编码工具。你可以根据自己的工作流程调整 Pi，而无需 fork 和修改 Pi 内部代码。通过 TypeScript [扩展](#扩展)、[技能](#技能)、[提示模板](#提示模板)和[主题](#主题)来扩展它。将你的扩展、技能、提示模板和主题放入 [Pi 包](#pi-包)中，通过 npm 或 git 与他人分享。

Pi 提供了强大的默认功能，但跳过了子代理和计划模式等功能。相反，你可以让 Pi 构建你想要的功能，或安装与你的工作流程匹配的第三方 Pi 包。

Pi 以四种模式运行：交互式、打印或 JSON、RPC 用于进程集成，以及用于嵌入你自己应用程序的 SDK。查看 [openclaw/openclaw](https://github.com/openclaw/openclaw) 了解真实的 SDK 集成示例。

## 目录

- [快速开始](#快速开始)
- [提供商和模型](#提供商和模型)
- [交互模式](#交互模式)
  - [编辑器](#编辑器)
  - [命令](#命令)
  - [键盘快捷键](#键盘快捷键)
  - [消息队列](#消息队列)
- [会话](#会话)
  - [分支](#分支)
  - [压缩](#压缩)
- [设置](#设置)
- [上下文文件](#上下文文件)
- [自定义](#自定义)
  - [提示模板](#提示模板)
  - [技能](#技能)
  - [扩展](#扩展)
  - [主题](#主题)
  - [Pi 包](#pi-包)
- [编程使用](#编程使用)
- [理念](#理念)
- [CLI 参考](#cli-参考)

---

## 快速开始

```bash
npm install -g @mariozechner/pi-coding-agent
```

使用 API 密钥认证：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

或使用现有订阅：

```bash
pi
/login  # 然后选择提供商
```

然后直接与 Pi 对话。默认情况下，Pi 给模型四个工具：`read`、`write`、`edit` 和 `bash`。模型使用这些工具来完成你的请求。通过[技能](#技能)、[提示模板](#提示模板)、[扩展](#扩展)或 [Pi 包](#pi-包)添加更多功能。

**平台说明：** [Windows](docs/windows.md) | [Termux (Android)](docs/termux.md) | [tmux](docs/tmux.md) | [终端设置](docs/terminal-setup.md) | [Shell 别名](docs/shell-aliases.md)

---

## 提供商和模型

对于每个内置提供商，Pi 维护一个支持工具的模型列表，每次发布时更新。通过订阅（`/login`）或 API 密钥认证，然后通过 `/model`（或 Ctrl+L）选择该提供商的任何模型。

**订阅：**
- Anthropic Claude Pro/Max
- OpenAI ChatGPT Plus/Pro (Codex)
- GitHub Copilot
- Google Gemini CLI
- Google Antigravity

**API 密钥：**
- Anthropic
- OpenAI
- Azure OpenAI
- Google Gemini
- Google Vertex
- Amazon Bedrock
- Mistral
- Groq
- Cerebras
- xAI
- OpenRouter
- Vercel AI Gateway
- ZAI
- OpenCode Zen
- OpenCode Go
- Hugging Face
- Kimi For Coding
- MiniMax

查看 [docs/providers.md](docs/providers.md) 获取详细的设置说明。

**自定义提供商和模型：** 如果提供商使用支持的 API（OpenAI、Anthropic、Google），通过 `~/.pi/agent/models.json` 添加提供商。对于自定义 API 或 OAuth，使用扩展。查看 [docs/models.md](docs/models.md) 和 [docs/custom-provider.md](docs/custom-provider.md)。

---

## 交互模式

界面从上到下：

- **启动头部** - 显示快捷键（`/hotkeys` 查看全部）、加载的 AGENTS.md 文件、提示模板、技能和扩展
- **消息** - 你的消息、助手响应、工具调用和结果、通知、错误和扩展 UI
- **编辑器** - 你输入的地方；边框颜色表示思考级别
- **页脚** - 工作目录、会话名称、总令牌/缓存使用量、成本、上下文使用量、当前模型

编辑器可以被其他 UI 临时替换，比如内置的 `/settings` 或扩展的自定义 UI（例如，一个问答工具，让用户以结构化格式回答模型问题）。[扩展](#扩展)还可以替换编辑器、在编辑器上方/下方添加小部件、状态行、自定义页脚或覆盖层。

### 编辑器

| 功能 | 方法 |
|---------|-----|
| 文件引用 | 输入 `@` 模糊搜索项目文件 |
| 路径补全 | Tab 补全路径 |
| 多行 | Shift+Enter（或在 Windows 终端上 Ctrl+Enter）|
| 图片 | Ctrl+V 粘贴（在 Windows 上 Alt+V），或拖放到终端 |
| Bash 命令 | `!command` 运行并将输出发送给 LLM，`!!command` 运行但不发送 |

标准编辑键绑定用于删除单词、撤销等。查看 [docs/keybindings.md](docs/keybindings.md)。

### 命令

在编辑器中输入 `/` 触发命令。[扩展](#扩展)可以注册自定义命令，[技能](#技能)可作为 `/skill:name` 使用，[提示模板](#提示模板)通过 `/templatename` 展开。

| 命令 | 描述 |
|---------|-------------|
| `/login`, `/logout` | OAuth 认证 |
| `/model` | 切换模型 |
| `/scoped-models` | 启用/禁用 Ctrl+P 循环的模型 |
| `/settings` | 思考级别、主题、消息传递、传输 |
| `/resume` | 从之前的会话中选择 |
| `/new` | 开始新会话 |
| `/name <name>` | 设置会话显示名称 |
| `/session` | 显示会话信息（路径、令牌、成本）|
| `/tree` | 跳转到会话中的任意点并从那里继续 |
| `/fork` | 从当前分支创建新会话 |
| `/compact [prompt]` | 手动压缩上下文，可选自定义指令 |
| `/copy` | 复制最后一条助手消息到剪贴板 |
| `/export [file]` | 导出会话到 HTML 文件 |
| `/share` | 上传为私有 GitHub gist，带可分享的 HTML 链接 |
| `/reload` | 重新加载键绑定、扩展、技能、提示和上下文文件（主题热重载自动）|
| `/hotkeys` | 显示所有键盘快捷键 |
| `/changelog` | 显示版本历史 |
| `/quit`, `/exit` | 退出 pi |

### 键盘快捷键

查看 `/hotkeys` 获取完整列表。通过 `~/.pi/agent/keybindings.json` 自定义。查看 [docs/keybindings.md](docs/keybindings.md)。

**常用：**

| 键 | 动作 |
|-----|--------|
| Ctrl+C | 清除编辑器 |
| Ctrl+C 两次 | 退出 |
| Escape | 取消/中止 |
| Escape 两次 | 打开 `/tree` |
| Ctrl+L | 打开模型选择器 |
| Ctrl+P / Shift+Ctrl+P | 向前/向后循环限定模型 |
| Shift+Tab | 循环思考级别 |
| Ctrl+O | 折叠/展开工具输出 |
| Ctrl+T | 折叠/展开思考块 |

### 消息队列

在代理工作时提交消息：

- **Enter** 排队一个*引导*消息，在当前助手回合完成执行其工具调用后传递
- **Alt+Enter** 排队一个*跟进*消息，仅在代理完成所有工作后传递
- **Escape** 中止并将排队的消息恢复到编辑器
- **Alt+Up** 将排队的消息检索回编辑器

在 Windows 终端上，`Alt+Enter` 默认是全屏。在 [docs/terminal-setup.md](docs/terminal-setup.md) 中重新映射，让 Pi 可以接收跟进快捷键。

在 [设置](docs/settings.md) 中配置传递：`steeringMode` 和 `followUpMode` 可以是 `"one-at-a-time"`（默认，等待响应）或 `"all"`（一次传递所有排队）。`transport` 选择提供商传输偏好（`"sse"`、`"websocket"` 或 `"auto"`）用于支持多种传输的提供商。

---

## 会话

会话以 JSONL 文件存储，带有树结构。每个条目有 `id` 和 `parentId`，支持原地分支而无需创建新文件。查看 [docs/session.md](docs/session.md) 了解文件格式。

### 管理

会话自动保存到 `~/.pi/agent/sessions/`，按工作目录组织。

```bash
pi -c                  # 继续最近的会话
pi -r                  # 浏览并从过去的会话中选择
pi --no-session        # 临时模式（不保存）
pi --session <path>    # 使用特定会话文件或 ID
pi --fork <path>       # 将特定会话文件或 ID 分叉到新会话
```

### 分支

**`/tree`** - 原地导航会话树。选择任意之前的点，从那里继续，并在分支之间切换。所有历史保存在单个文件中。

- 通过输入搜索，用 Ctrl+←/Ctrl+→ 或 Alt+←/Alt+→ 折叠/展开和在分支之间跳转，用 ←/→ 翻页
- 过滤模式（Ctrl+O）：默认 → 无工具 → 仅用户 → 仅标记 → 全部
- 按 `l` 将条目标记为书签

**`/fork`** - 从当前分支创建新会话文件。打开选择器，复制到所选点的历史，并将该消息放入编辑器以供修改。

**`--fork <path|id>`** - 直接从 CLI 分叉现有会话文件或部分会话 UUID。这将完整源会话复制到当前项目的新会话文件中。

### 压缩

长会话可能耗尽上下文窗口。压缩在保留最近消息的同时总结旧消息。

**手动：** `/compact` 或 `/compact <custom instructions>`

**自动：** 默认启用。在上下文溢出时触发（恢复并重试）或接近限制时（主动）。通过 `/settings` 或 `settings.json` 配置。

压缩是有损的。完整历史保留在 JSONL 文件中；使用 `/tree` 重新访问。通过 [扩展](#扩展) 自定义压缩行为。查看 [docs/compaction.md](docs/compaction.md) 了解内部机制。

---

## 设置

使用 `/settings` 修改常用选项，或直接编辑 JSON 文件：

| 位置 | 范围 |
|----------|-------|
| `~/.pi/agent/settings.json` | 全局（所有项目）|
| `.pi/settings.json` | 项目（覆盖全局）|

查看 [docs/settings.md](docs/settings.md) 了解所有选项。

---

## 上下文文件

Pi 在启动时从以下位置加载 `AGENTS.md`（或 `CLAUDE.md`）：
- `~/.pi/agent/AGENTS.md`（全局）
- 父目录（从 cwd 向上遍历）
- 当前目录

用于项目指令、约定、常用命令。所有匹配文件连接在一起。

### 系统提示词

用 `.pi/SYSTEM.md`（项目）或 `~/.pi/agent/SYSTEM.md`（全局）替换默认系统提示词。通过 `APPEND_SYSTEM.md` 追加而不替换。

---

## 自定义

### 提示模板

可重用的提示作为 Markdown 文件。输入 `/name` 展开。

```markdown
<!-- ~/.pi/agent/prompts/review.md -->
审查此代码的错误、安全问题和性能问题。
重点关注：{{focus}}
```

放在 `~/.pi/agent/prompts/`、`.pi/prompts/` 或 [pi 包](#pi-包) 中与他人分享。查看 [docs/prompt-templates.md](docs/prompt-templates.md)。

### 技能

按需能力包，遵循 [Agent Skills 标准](https://agentskills.io)。通过 `/skill:name` 调用或让代理自动加载。

```markdown
<!-- ~/.pi/agent/skills/my-skill/SKILL.md -->
# 我的技能
当用户询问 X 时使用此技能。

## 步骤
1. 做这个
2. 然后做那个
```

放在 `~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/` 或 `.agents/skills/`（从 `cwd` 向上通过父目录）或 [pi 包](#pi-包) 中与他人分享。查看 [docs/skills.md](docs/skills.md)。

### 扩展

TypeScript 模块，用自定义工具、命令、键盘快捷键、事件处理器和 UI 组件扩展 Pi。

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
}
```

**可能性：**
- 自定义工具（或完全替换内置工具）
- 子代理和计划模式
- 自定义压缩和总结
- 权限门和路径保护
- 自定义编辑器和 UI 组件
- 状态行、头部、页脚
- Git 检查点和自动提交
- SSH 和沙箱执行
- MCP 服务器集成
- 让 Pi 看起来像 Claude Code
- 等待时的游戏（是的，Doom 可以运行）
- ...你能想到的任何东西

放在 `~/.pi/agent/extensions/`、`.pi/extensions/` 或 [pi 包](#pi-包) 中与他人分享。查看 [docs/extensions.md](docs/extensions.md) 和 [examples/extensions/](examples/extensions/)。

### 主题

内置：`dark`、`light`。主题热重载：修改活动主题文件，Pi 立即应用更改。

放在 `~/.pi/agent/themes/`、`.pi/themes/` 或 [pi 包](#pi-包) 中与他人分享。查看 [docs/themes.md](docs/themes.md)。

### Pi 包

通过 npm 或 git 捆绑和分享扩展、技能、提示和主题。在 [npmjs.com](https://www.npmjs.com/search?q=keywords%3Api-package) 或 [Discord](https://discord.com/channels/1456806362351669492/1457744485428629628) 上查找包。

> **安全：** Pi 包以完全系统访问权限运行。扩展执行任意代码，技能可以指示模型执行任何操作，包括运行可执行文件。在安装第三方包之前审查源代码。

```bash
pi install npm:@foo/pi-tools
pi install npm:@foo/pi-tools@1.2.3      # 固定版本
pi install git:github.com/user/repo
pi install git:github.com/user/repo@v1  # 标签或提交
pi install git:git@github.com:user/repo
pi install git:git@github.com:user/repo@v1  # 标签或提交
pi install https://github.com/user/repo
pi install https://github.com/user/repo@v1      # 标签或提交
pi install ssh://git@github.com/user/repo
pi install ssh://git@github.com/user/repo@v1    # 标签或提交
pi remove npm:@foo/pi-tools
pi uninstall npm:@foo/pi-tools          # remove 的别名
pi list
pi update                               # 跳过固定包
pi config                               # 启用/禁用扩展、技能、提示、主题
```

包安装到 `~/.pi/agent/git/`（git）或全局 npm。使用 `-l` 进行项目本地安装（`.pi/git/`、`.pi/npm/`）。如果你使用 Node 版本管理器，希望包安装重用稳定的 npm 上下文，在 `settings.json` 中设置 `npmCommand`，例如 `["mise", "exec", "node@20", "--", "npm"]`。

通过向 `package.json` 添加 `pi` 键创建包：

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

没有 `pi` 清单时，Pi 从常规目录（`extensions/`、`skills/`、`prompts/`、`themes/`）自动发现。

查看 [docs/packages.md](docs/packages.md)。

---

## 编程使用

### SDK

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage: AuthStorage.create(),
  modelRegistry: new ModelRegistry(authStorage),
});

await session.prompt("当前目录中有哪些文件？");
```

查看 [docs/sdk.md](docs/sdk.md) 和 [examples/sdk/](examples/sdk/)。

### RPC 模式

对于非 Node.js 集成，使用 stdin/stdout 上的 RPC 模式：

```bash
pi --mode rpc
```

RPC 模式使用严格的 LF 分隔 JSONL 帧。客户端必须仅在 `\n` 上分割记录。不要使用通用的行读取器，如 Node `readline`，它也会在 JSON 负载内的 Unicode 分隔符上分割。

查看 [docs/rpc.md](docs/rpc.md) 了解协议。

---

## 理念

Pi 积极可扩展，因此它不必规定你的工作流程。其他工具内置的功能可以用 [扩展](#扩展)、[技能](#技能) 构建，或从第三方 [pi 包](#pi-包) 安装。这保持核心最小化，同时让你塑造 Pi 以适应你的工作方式。

**没有 MCP。** 构建带 README 的 CLI 工具（查看 [技能](#技能)），或构建添加 MCP 支持的扩展。[为什么？](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)

**没有子代理。** 有很多方法可以做到这一点。通过 tmux 生成 Pi 实例，或用 [扩展](#扩展) 构建你自己的，或安装一个以你的方式实现的包。

**没有权限弹窗。** 在容器中运行，或用 [扩展](#扩展) 构建你自己的确认流程，与你的环境和安全要求保持一致。

**没有计划模式。** 将计划写入文件，或用 [扩展](#扩展) 构建它，或安装一个包。

**没有内置待办事项。** 它们会混淆模型。使用 TODO.md 文件，或用 [扩展](#扩展) 构建你自己的。

**没有后台 bash。** 使用 tmux。完全可观察，直接交互。

阅读[博客文章](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)了解完整原理。

---

## CLI 参考

```bash
pi [options] [@files...] [messages...]
```

### 包命令

```bash
pi install <source> [-l]     # 安装包，-l 项目本地
pi remove <source> [-l]      # 移除包
pi uninstall <source> [-l]   # remove 的别名
pi update [source]           # 更新包（跳过固定）
pi list                      # 列出已安装包
pi config                    # 启用/禁用包资源
```

### 模式

| 标志 | 描述 |
|------|-------------|
| (默认) | 交互模式 |
| `-p`, `--print` | 打印响应并退出 |
| `--mode json` | 将所有事件输出为 JSON 行（查看 [docs/json.md](docs/json.md)）|
| `--mode rpc` | 用于进程集成的 RPC 模式（查看 [docs/rpc.md](docs/rpc.md)）|
| `--export <in> [out]` | 导出会话到 HTML |

在打印模式下，Pi 还读取管道 stdin 并将其合并到初始提示：

```bash
cat README.md | pi -p "总结这段文字"
```

### 模型选项

| 选项 | 描述 |
|--------|-------------|
| `--provider <name>` | 提供商（anthropic、openai、google 等）|
| `--model <pattern>` | 模型模式或 ID（支持 `provider/id` 和可选 `:<thinking>`）|
| `--api-key <key>` | API 密钥（覆盖环境变量）|
| `--thinking <level>` | `off`、`minimal`、`low`、`medium`、`high`、`xhigh` |
| `--models <patterns>` | 逗号分隔的 Ctrl+P 循环模式 |
| `--list-models [search]` | 列出可用模型 |

### 会话选项

| 选项 | 描述 |
|--------|-------------|
| `-c`, `--continue` | 继续最近的会话 |
| `-r`, `--resume` | 浏览并选择会话 |
| `--session <path>` | 使用特定会话文件或部分 UUID |
| `--fork <path>` | 将特定会话文件或部分 UUID 分叉到新会话 |
| `--session-dir <dir>` | 自定义会话存储目录 |
| `--no-session` | 临时模式（不保存）|

### 工具选项

| 选项 | 描述 |
|--------|-------------|
| `--tools <list>` | 启用特定内置工具（默认：`read,bash,edit,write`）|
| `--no-tools` | 禁用所有内置工具（扩展工具仍然工作）|

可用内置工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`

### 资源选项

| 选项 | 描述 |
|--------|-------------|
| `-e`, `--extension <source>` | 从路径、npm 或 git 加载扩展（可重复）|
| `--no-extensions` | 禁用扩展发现 |
| `--skill <path>` | 加载技能（可重复）|
| `--no-skills` | 禁用技能发现 |
| `--prompt-template <path>` | 加载提示模板（可重复）|
| `--no-prompt-templates` | 禁用提示模板发现 |
| `--theme <path>` | 加载主题（可重复）|
| `--no-themes` | 禁用主题发现 |

将 `--no-*` 与显式标志结合，精确加载所需内容，忽略 settings.json（例如，`--no-extensions -e ./my-ext.ts`）。

### 其他选项

| 选项 | 描述 |
|--------|-------------|
| `--system-prompt <text>` | 替换默认提示（上下文文件和技能仍然追加）|
| `--append-system-prompt <text>` | 追加到系统提示 |
| `--verbose` | 强制详细启动 |
| `-h`, `--help` | 显示帮助 |
| `-v`, `--version` | 显示版本 |

### 文件参数

在消息前加上 `@` 以包含在消息中：

```bash
pi @prompt.md "回答这个"
pi -p @screenshot.png "这张图片里有什么？"
pi @code.ts @test.ts "审查这些文件"
```

### 示例

```bash
# 带初始提示的交互式
pi "列出 src/ 中的所有 .ts 文件"

# 非交互式
pi -p "总结这个代码库"

# 带管道 stdin 的非交互式
cat README.md | pi -p "总结这段文字"

# 不同模型
pi --provider openai --model gpt-4o "帮我重构"

# 带提供商前缀的模型（不需要 --provider）
pi --model openai/gpt-4o "帮我重构"

# 带思考级别简写的模型
pi --model sonnet:high "解决这个复杂问题"

# 限制模型循环
pi --models "claude-*,gpt-4o"

# 只读模式
pi --tools read,grep,find,ls -p "审查代码"

# 高思考级别
pi --thinking high "解决这个复杂问题"
```

### 环境变量

| 变量 | 描述 |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录（默认：`~/.pi/agent`）|
| `PI_PACKAGE_DIR` | 覆盖包目录（对 Nix/Guix 有用，存储路径标记不佳）|
| `PI_SKIP_VERSION_CHECK` | 启动时跳过版本检查 |
| `PI_CACHE_RETENTION` | 设置为 `long` 以延长提示缓存（Anthropic：1小时，OpenAI：24小时）|
| `VISUAL`, `EDITOR` | Ctrl+G 的外部编辑器 |

---

## 贡献和开发

查看 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解指南和 [docs/development.md](docs/development.md) 了解设置、fork 和调试。

---

## 许可证

MIT

## 另请参阅

- [@mariozechner/pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai)：核心 LLM 工具包
- [@mariozechner/pi-agent](https://www.npmjs.com/package/@mariozechner/pi-agent)：代理框架
- [@mariozechner/pi-tui](https://www.npmjs.com/package/@mariozechner/pi-tui)：终端 UI 组件
