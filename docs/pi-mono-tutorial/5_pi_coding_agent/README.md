# pi-coding-agent 文档导读

> 本目录聚焦 `packages/coding-agent`。这里按学习路径整理了主线教程，帮助你从概念理解到实际开发，逐步掌握 pi-coding-agent 的使用与扩展。

---

## 目录结构

### 主线文档（核心必读）

主线文档覆盖从概念到实现，再到定制与扩展的完整学习路径。

| 顺序 | 文档 | 内容概要 | 适合谁 |
|------|------|----------|--------|
| 1 | [01-core-concepts.md](01-core-concepts.md) | 核心概念：Agent、Session、Conversation、Message、Skill、Extension | 初学者 |
| 2 | [02-architecture.md](02-architecture.md) | 架构设计：SessionManager、AgentSession、ResourceLoader、运行模式 | 初学者 / 进阶读者 |
| 3 | [03-tools.md](03-tools.md) | 工具系统详解：7 个核心工具、工具执行流程、自定义工具 | 进阶读者 |
| 4 | [04-skill-system.md](04-skill-system.md) | Skill 系统完整指南：创建、发现、使用、分享 | 进阶读者 / Skill 开发者 |
| 5 | [05-extension-system.md](05-extension-system.md) | Extension 系统开发指南：API、生命周期、最佳实践 | Extension 开发者 |

### 进阶文档（深入学习）

| 顺序 | 文档 | 内容概要 | 适合谁 |
|------|------|----------|--------|
| 6 | [06-session-management.md](06-session-management.md) | 会话管理：生命周期、持久化、分支与恢复 | 进阶读者 |
| 7 | [07-interactive-mode.md](07-interactive-mode.md) | 交互模式与 TUI：组件设计、消息渲染、快捷键 | 交互模式开发者 |
| 8 | [08-context-management.md](08-context-management.md) | 上下文管理：Token 预算、自动压缩、会话树 | 需要优化长会话性能时 |
| 9 | [09-prompts-theming.md](09-prompts-theming.md) | Prompt/主题/模型定制：行为定制、界面美化 | 想要个性化配置的用户 |
| 10 | [10-advanced-features.md](10-advanced-features.md) | 高级功能：自定义工具、插件系统、性能优化 | 专家用户 |

### 专题与参考（按需阅读）

| 文档 | 内容概要 | 适合什么时候看 |
|------|----------|----------------|
| [00-README-zh.md](00-README-zh.md) | 官方 README 中文整理 | 需要参考早期文档时 |
| [99-topics-session-branching.md](99-topics-session-branching.md) | 会话树与分支机制深度解析 | 需要理解会话树内部实现时 |

---

## 主线文档说明

按照"先对齐事实，再收敛主线，再弱化旧文"的原则，主线文档进行了重新梳理：

### 主线覆盖范围

- **01 核心概念**：Agent、Session、Conversation、Message、Skill、Extension 的概念关系
- **02 架构设计**：整体架构、运行模式（text/json/rpc）、资源加载、扩展点
- **03 工具系统**：内置工具、工具执行流程、自定义工具开发
- **04 Skill 系统**：Skill 创建、发现、使用、分享
- **05 Extension 系统**：Extension 开发、API、生命周期、发布
- **06 会话管理**：会话生命周期、持久化、分支与恢复
- **07 交互模式**：TUI 组件、消息渲染、输入处理、快捷键
- **08 上下文管理**：Token 预算、自动压缩、会话树结构
- **09 Prompt/主题**：系统提示词定制、主题美化、模型切换
- **10 高级功能**：自定义工具、插件系统、性能优化

### 文档约定

- **代码示例标注来源**：`[真实API]`、`[概念性示例]`、`[简化示意]`
- **关键概念提供源码路径**：如 `packages/coding-agent/src/core/agent-session.ts`
- **虚构的模式/工具已删除**：仅保留真实存在的实现

---

## 学习路径

### 新手用户（第一次使用 pi）

1. 阅读 **01 核心概念**（理解基本概念）
2. 阅读 **02 架构设计**（了解运行模式）
3. 阅读 **03 工具系统**（了解可用工具）
4. 实践：安装 Skill、使用 `/skill:name` 命令

### 进阶用户（想要定制 pi）

1. 阅读 **01-05**（理解基础）
2. 阅读 **06 会话管理**（理解会话持久化和分支）
3. 阅读 **09 Prompt/主题**（个性化配置）
4. 实践：编写一个自定义 Skill

### 开发者（想要开发 Extension）

1. 阅读 **01-05**（理解基础）
2. 阅读 **07 交互模式**（理解 TUI 架构）
3. 阅读 **10 高级功能**（自定义工具、插件）
4. 实践：开发一个自定义工具 Extension

### 专家用户（深度优化）

1. 阅读 **08 上下文管理**（Token 预算、压缩策略）
2. 阅读 **10 高级功能**（性能优化、最佳实践）
3. 阅读 **99 专题**（会话树深度解析）

---

## 关键修正说明

本次文档修订的主要变化：

### 主要修正

| 项目 | 修正前 | 修正后 |
|------|--------|--------|
| 运行模式 | `text`/`interactive`/`headless`/`oneshot`/`file`/`github-pr` | `text`/`json`/`rpc` |
| API 示例 | 无标注，易混淆 | 标注 `[真实API]` 或 `[概念性示例]` |
| 工具列表 | 11 个虚构工具 | 7 个真实工具 |
| Skill 系统 | 未完整覆盖 | 新增完整章节 |
| Extension 系统 | 未完整覆盖 | 新增完整章节 |
| 源码引用 | 缺失或过时 | 为每个核心概念提供真实路径 |

### 新增章节

- **04 Skill 系统**：完整的 Skill 创建、使用、分享指南
- **05 Extension 系统**：Extension API、生命周期、开发实践
- **会话管理架构**：Session 状态流转、持久化、分支管理
- **资源加载架构**：ResourceLoader 机制、热更新支持

### 专题与参考

以下早期文档和专题文档不再作为主线入口，但保留参考价值：

- `00-README-zh.md` - 官方 README 的中文整理
- `99-topics-session-branching.md` - 会话分支专题（内容已并入 06/08）
- `09-prompts-theming.md` - Prompt 和 Theme 专题（已移至进阶文档）

---

## 快速开始

### 安装

```bash
npm install -g @pi/coding-agent
```

### 基本使用

```bash
# 交互模式
pi

# 单次执行
pi --mode text "解释一下 React hooks"

# JSON 输出
pi --mode json "创建一个 Todo 组件"
```

### 安装 Skill

```bash
# 列出可用 Skills
pi skill list

# 安装 Skill
pi skill install @pi/skill-git

# 使用 Skill
/skill:git commit
```

---

## 贡献指南

### 如何贡献

1. **Fork 仓库** 并创建你的分支
2. **提交更改** 并确保通过测试
3. **创建 Pull Request** 并描述变更内容

### 文档贡献

- 文档中的代码示例需要与源码保持一致
- 新增概念需要提供对应源码引用
- 使用 `[真实API]`/`[概念性示例]`/`[简化示意]` 标注示例类型

### 源码对应

阅读时可以优先对照这些位置：

| 目录 | 内容 |
|------|------|
| `packages/coding-agent/src/cli/` | CLI 入口与参数解析 |
| `packages/coding-agent/src/core/` | 会话、模型、系统提示、上下文等核心逻辑 |
| `packages/coding-agent/src/core/tools/` | 内置工具 |
| `packages/coding-agent/src/skill/` | Skill 系统 |
| `packages/coding-agent/src/extension/` | Extension 系统 |
| `packages/coding-agent/src/ui/` | 交互界面 |

---

## 从哪里开始

第一次阅读建议直接从 [01-core-concepts.md](01-core-concepts.md) 开始。
