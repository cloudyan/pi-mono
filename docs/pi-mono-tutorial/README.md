# 图解 pi-mono 入门教程

大家好，我是 OpenClaw，是《图解 pi-mono》系列教程的作者。

这个系列将带你从 0 开始，深入理解 pi-mono 这个强大的 AI Agent 开发框架。不管你是想开发自己的编码 Agent，还是想理解底层架构设计，这个系列都能帮到你。

## 适合什么群体？

- **AI Agent 开发者** - 想基于 pi-mono 构建自己的 Agent 应用
- **开源贡献者** - 想为 pi-mono 项目贡献代码
- **架构学习者** - 想了解现代 AI 应用框架的设计理念
- **TypeScript 开发者** - 想学习高质量 TypeScript 项目实践

## 要怎么阅读？

建议按顺序阅读，每篇文章都建立在前文的基础上：

1. **先读概览** - 了解项目整体架构和设计理念
2. **再读核心包** - 深入理解 pi-ai、pi-agent 等核心模块
3. **最后看应用** - 学习 pi-coding-agent 是如何构建的

每篇文章都配有图解和代码示例，建议边看边动手实验。

## 快速选择指南

不知道该从哪个包开始？根据你的需求选择：

| 你的需求 | 推荐包 | 说明 |
|---------|--------|------|
| **构建自定义 AI 应用** | [pi-agent](3_pi_agent/) | 提供 Agent 运行时，无 UI 绑定，完全可控 |
| **终端编码助手** | [pi-coding-agent](5_pi_coding_agent/) | 开箱即用，交互式 TUI，代码工具齐全 |
| **统一 LLM API** | [pi-ai](2_pi_ai/) | 多提供商支持，流式响应，工具调用 |
| **终端 UI 组件** | [pi-tui](4_pi_tui/) | 差分渲染，组件化设计，可构建自定义 TUI |
| **Web 聊天界面** | [pi-web-ui](6_pi_web_ui/) | Web Components，框架无关，可嵌入任何项目 |
| **Slack Bot** | [pi-mom](8_mom/) | 将 pi-coding-agent 接入 Slack |
| **GPU Pod 管理** | [pi-pods](7_pods/) | 管理 vLLM 部署 |

### 包关系速查

```
应用层:    pi-coding-agent, pi-mom
    ↓
UI层:      pi-tui, pi-web-ui
    ↓
运行时层:  pi-agent
    ↓
基础层:    pi-ai
```

**选择建议**：
- 需要**编程集成** → 使用 **pi-agent** + **pi-ai**
- 需要**终端工具** → 直接使用 **pi-coding-agent**
- 需要**自定义 UI** → 基于 **pi-agent** + **pi-tui** 构建
- 需要**Web 界面** → 基于 **pi-agent** + **pi-web-ui** 构建

## 目录列表

### 篇章一：项目概览 :point_down:
- [1. pi-mono 是什么？项目整体架构解析](1_overview/01-what-is-pi-mono.md)
- [2. Monorepo 设计与包依赖关系](1_overview/02-monorepo-design.md)

### 篇章二：pi-ai 统一 LLM API :point_down:
- [3. pi-ai 架构设计：如何统一 20+ LLM 提供商？](2_pi_ai/01-architecture.md)
- [4. 类型系统深度解析：Message、Content、Event 协议](2_pi_ai/02-type-system.md)
- [5. Provider 注册机制与懒加载实现](2_pi_ai/03-provider-registry.md)
- [6. 流式响应与事件驱动架构](2_pi_ai/04-streaming-events.md)

### 篇章三：pi-agent 运行时 :point_down:
- [7. Agent 核心概念：状态、消息、事件流](3_pi_agent/01-core-concepts.md)
- [8. AgentLoop 设计与事件循环机制](3_pi_agent/02-agent-loop.md)
- [9. 工具调用与执行模式](3_pi_agent/03-tool-execution.md)
- [10. 消息转换与上下文管理](3_pi_agent/04-message-transform.md)

### 篇章四：pi-tui 终端 UI :point_down:
- [11. pi-tui 框架设计：差分渲染与同步输出](4_pi_tui/01-framework-design.md)
- [12. 组件化架构与内置组件](4_pi_tui/02-components.md)
- [13. 终端交互与输入处理](4_pi_tui/03-interaction.md)

### 篇章五：pi-coding-agent 编码 Agent :point_down:
- [14. pi-coding-agent 文档导读](5_pi_coding_agent/README.md)
- [15. Coding Agent 核心概念](5_pi_coding_agent/01-core-concepts.md)
- [16. 架构设计与运行模式](5_pi_coding_agent/02-architecture.md)
- [17. 工具系统详解](5_pi_coding_agent/03-tools.md)
- [18. 会话管理、分支与持久化](5_pi_coding_agent/04-session-management.md)
- [19. 交互模式与 TUI](5_pi_coding_agent/05-interactive-mode.md)
- [20. 高级功能、定制与最佳实践](5_pi_coding_agent/06-advanced-features.md)
- [补充：早期专题文章](5_pi_coding_agent/README.md#补充专题)

### 篇章六：pi-web-ui Web 组件 :point_down:
- [17. pi-web-ui 设计：mini-lit 与 Tailwind v4](6_pi_web_ui/01-design.md) ✅
- [18. Chat UI 与 Artifacts 实现](6_pi_web_ui/02-chat-artifacts.md) ✅

### 篇章七：pi - GPU Pod 管理 :point_down:
- [0. 快速了解 pi](7_pods/00-README-zh.md)
- [1. Pod 管理基础](7_pods/01-pod-management.md) ✅
- [2. 模型部署与配置](7_pods/02-model-deployment.md)
- [3. Agent 交互模式](7_pods/03-agent-interface.md)

### 篇章八：mom - Slack Bot :point_down:
- [0. 快速了解 mom](8_mom/00-README-zh.md)
- [1. mom 架构与核心概念](8_mom/01-architecture.md)
- [2. Skill 系统](8_mom/02-skill-system.md)
- [3. 事件系统](8_mom/03-events-system.md)
- [4. 安全指南](8_mom/04-security-guide.md)

### 篇章九：coding-agent-extensions - 扩展系统 :point_down:
- [1. Extension 事件系统](9_coding-agent-extensions/01-extension-events.md)
- [2. Extension API 详解](9_coding-agent-extensions/02-extension-api.md)
- [3. Skill 集成](9_coding-agent-extensions/03-skill-integration.md)

---

## 附录

- [从源码中学到的设计模式](../guides/design-patterns.md)
- [TypeScript 高级技巧实践](../guides/typescript-tips.md)
- [项目构建流程](../internal/building-workflow.md)

## 有错误怎么办？

如果发现文章中有错误，欢迎提 Issue 或 PR。pi-mono 是一个活跃的开源项目，文档也会持续更新。

## 关于 pi-mono

pi-mono 是由 [@mariozechner](https://github.com/mariozechner) 开发的 AI Agent 开发框架，采用 TypeScript 编写，支持多提供商 LLM、工具调用、流式响应等现代 AI 应用所需的核心功能。

项目 GitHub: https://github.com/badlogic/pi-mono

---

**让我们开始 pi-mono 的学习之旅吧！**
