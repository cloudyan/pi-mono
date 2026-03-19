# pi-coding-agent 系列教程

> 深入理解 @mariozechner/pi —— AI 驱动的编码助手

## 系列概览

本系列带你深入理解 pi-coding-agent 的设计原理和最佳实践。pi-coding-agent 是一个**AI 驱动的编码助手**，在 pi-agent 和 pi-tui 的基础上构建，专为软件开发场景设计。

### 核心能力

- ✅ **代码理解** —— 读取、搜索、分析代码库
- ✅ **代码编写** —— 创建、编辑、重构代码
- ✅ **调试修复** —— 分析错误、定位问题、修复 Bug
- ✅ **多种运行模式** —— interactive、headless、oneshot、file、github-pr
- ✅ **丰富工具集** —— read、write、edit、bash、grep、ast-grep、lsp 等
- ✅ **会话管理** —— 自动保存、恢复、历史记录

## 阅读路径

### 核心教程（必读）

| 章节 | 难度 | 预计时间 | 核心内容 |
|------|------|---------|---------|
| **[00-README-zh.md](00-README-zh.md)** | 入门 | 15 分钟 | 官方 README 中文翻译，快速了解 pi-coding-agent |
| **[01-core-concepts.md](01-core-concepts.md)** | 入门 | 20 分钟 | Agent Session、工具系统、运行模式、系统提示词 |
| **[02-architecture.md](02-architecture.md)** | 进阶 | 25 分钟 | CLI 入口、运行模式详解、模式选择指南 |
| **[03-tools.md](03-tools.md)** | 进阶 | 30 分钟 | 文件操作、代码搜索、LSP 工具、项目管理工具 |
| **[04-session-management.md](04-session-management.md)** | 进阶 | 20 分钟 | 会话生命周期、自动保存、恢复、备份 |
| **[05-interactive-mode.md](05-interactive-mode.md)** | 进阶 | 25 分钟 | TUI 组件、消息渲染、流式显示、快捷键 |
| **[06-advanced-features.md](06-advanced-features.md)** | 专家 | 25 分钟 | 自定义工具、插件系统、性能优化、安全实践、测试策略 |

### 阅读建议

**如果你是初学者**：
1. 按顺序阅读 01 → 02 → 03
2. 每章配合代码示例实践
3. 完成后再阅读 04、05、06

**如果你是进阶开发者**：
1. 快速浏览 01 了解基本概念
2. 重点阅读 02、03 理解核心机制
3. 04、05、06 按需查阅

**如果你是专家开发者**：
1. 直接阅读 02、06
2. 参考源码深入理解
3. 贡献最佳实践案例

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|------|------|---------|
| Agent Session | 管理一次完整的编码任务 | 01 |
| 工具系统 | 让 AI 能够实际操作代码库 | 01、03 |
| 运行模式 | interactive、headless、oneshot 等 | 01、02 |
| 系统提示词 | 定义 AI 的行为和能力 | 01 |
| 会话持久化 | 自动保存和恢复会话状态 | 01、04 |
| TUI | 交互式终端界面 | 05 |
| 插件系统 | 扩展功能的钩子机制 | 06 |

## 快速开始

### 安装

```bash
npm install -g @mariozechner/pi
```

### 基础使用

```bash
# 启动交互式会话
pi

# 执行单次任务
pi --prompt "修复所有 ESLint 错误"

# 从文件读取任务
pi --file task.md

# 使用特定模型
pi --model anthropic:claude-sonnet-4-20250514
```

### 编程使用

```typescript
import { createAgentSession } from "@mariozechner/pi";

async function main() {
  const session = await createAgentSession({
    name: "my-task",
  });

  // 发送消息
  const response = await session.sendMessage("帮我优化这段代码");
  console.log(response.text);

  // 查看工具调用
  console.log(response.toolCalls);

  // 保存会话
  await session.save();
}

main();
```

## 运行模式

| 模式 | 用途 | 命令 |
|------|------|------|
| **interactive** | 交互式对话 | `pi` |
| **headless** | 自动化脚本 | `pi --mode headless --prompt "..."` |
| **oneshot** | 单次任务 | `pi --mode oneshot --prompt "..."` |
| **file** | 批量处理 | `pi --mode file --file tasks.md` |
| **github-pr** | PR 审查 | `pi --mode github-pr --pr 123` |

## 工具列表

### 文件操作
- `read` —— 读取文件内容
- `write` —— 创建或覆盖文件
- `edit` —— 精确编辑文件
- `bash` —— 执行命令行命令

### 代码搜索
- `grep` —— 文本搜索
- `ast-grep` —— AST 搜索
- `glob` —— 文件匹配

### 开发工具
- `lsp-diagnostics` —— 获取类型错误
- `lsp-symbols` —— 获取符号列表
- `skill` —— 调用 Skill 系统

### 项目管理
- `git` —— Git 操作
- `github` —— GitHub API

## 源码位置

- **源码**: `packages/coding-agent/src/` 目录
- **测试**: `packages/coding-agent/test/` 目录
- **核心**: `packages/coding-agent/src/core/` 目录
- **模式**: `packages/coding-agent/src/modes/` 目录
- **工具**: `packages/coding-agent/src/core/tools/` 目录

## 相关资源

- **pi-agent 系列**: [../3_pi_agent/README.md](../3_pi_agent/README.md)
- **pi-tui 系列**: [../4_pi_tui/README.md](../4_pi_tui/README.md)
- **pi-ai 系列**: [../2_pi_ai/README.md](../2_pi_ai/README.md)
- **API 参考**: 查看源码中的 JSDoc 注释
- **示例项目**: 参考 `packages/coding-agent/test/` 中的测试用例

## 术语统一表

| 英文术语 | 中文翻译 | 说明 |
|---------|---------|------|
| Session | 会话 | 一次完整的编码任务 |
| Tool | 工具 | AI 可以执行的操作 |
| Mode | 模式 | 运行方式 |
| Interactive | 交互式 | TUI 界面 |
| Headless | 无头模式 | 无界面，适合自动化 |
| Oneshot | 单次模式 | 执行单个任务 |
| Plugin | 插件 | 扩展功能 |
| Hook | 钩子 | 事件监听机制 |

## 学习建议

1. **先理解概念，再看代码**
   - 每章先通读理解概念
   - 再对照源码深入理解

2. **动手实践**
   - 每章都有代码示例
   - 建议自己运行一遍

3. **从简单到复杂**
   - 先使用 CLI 工具
   - 再编程使用 API
   - 最后自定义工具

4. **参考测试用例**
   - `packages/coding-agent/test/` 中有丰富的测试用例
   - 是学习 API 用法的最佳参考

## 常见问题

**Q: pi-coding-agent 和 pi-agent 有什么区别？**

A: pi-agent 是通用的对话管理器，pi-coding-agent 是在其基础上针对编码场景优化的版本，提供了丰富的代码操作工具和多种运行模式。

**Q: 如何添加自定义工具？**

A: 参考 [06-advanced-features.md](06-advanced-features.md) 中的"自定义工具"章节，实现 AgentTool 接口并注册即可。

**Q: 如何在 CI/CD 中使用？**

A: 使用 headless 模式：
```bash
pi --mode headless --prompt "检查代码质量" --output json
```

**Q: 如何恢复之前的会话？**

A: 使用 `--session` 参数：
```bash
pi --session my-task
```

**Q: 如何限制 AI 的操作范围？**

A: 配置安全选项：
```typescript
const session = await createAgentSession({
  security: {
    allowedPaths: ["src/**"],
    deniedPaths: [".env"],
  },
});
```

## 最佳实践

### ✅ 应该做的

1. **使用有意义的会话名**
   ```bash
   pi --session refactor-auth
   ```

2. **选择合适的运行模式**
   ```bash
   # 日常开发
   pi
   
   # CI/CD
   pi --mode headless
   ```

3. **配置安全选项**
   ```typescript
   security: {
     allowedPaths: ["src/**"],
     deniedPaths: [".env"],
   }
   ```

### ❌ 避免的错误

1. **在会话中存储敏感信息**
   ```typescript
   // ❌ 错误
   session.context.custom = { apiKey: "..." };
   ```

2. **在 CI 中使用 interactive 模式**
   ```bash
   # ❌ 错误
   pi --prompt "检查代码"
   
   # ✅ 正确
   pi --mode headless --prompt "检查代码"
   ```

---

**开始阅读**: [01-core-concepts.md](01-core-concepts.md)

**最后更新**: 2026-03-18
