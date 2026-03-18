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
- [14. pi-coding-agent 架构解析](5_pi_coding_agent/01-architecture.md) ✅
- [15. 会话管理与分支机制](5_pi_coding_agent/02-session-branching.md) ✅
- [16. 提示模板与主题定制](5_pi_coding_agent/03-prompts-theming.md) ✅

### 篇章六：pi-web-ui Web 组件 :point_down:
- [17. pi-web-ui 设计：mini-lit 与 Tailwind v4](6_pi_web_ui/01-design.md) ✅
- [18. Chat UI 与 Artifacts 实现](6_pi_web_ui/02-chat-artifacts.md) ✅

### 篇章七：扩展与技能系统 :point_down:
- [19. 扩展系统设计：Hooks 与插件机制](7_extension/01-extension-system.md) ✅
- [20. 技能系统：Skill 注册与执行](7_extension/02-skill-system.md) ✅

### 篇章八：学习心得 :point_down:
- [21. 从源码中学到的设计模式](8_learn/01-design-patterns.md) ✅
- [22. TypeScript 高级技巧实践](8_learn/02-typescript-tips.md) ✅

### 篇章九：项目构建与发布 :point_down:
- [23. 项目构建流程：从源码到发布的完整流转](9_building/01-building-workflow.md) ✅

## 有错误怎么办？

如果发现文章中有错误，欢迎提 Issue 或 PR。pi-mono 是一个活跃的开源项目，文档也会持续更新。

## 关于 pi-mono

pi-mono 是由 [@mariozechner](https://github.com/mariozechner) 开发的 AI Agent 开发框架，采用 TypeScript 编写，支持多提供商 LLM、工具调用、流式响应等现代 AI 应用所需的核心功能。

项目 GitHub: https://github.com/badlogic/pi-mono

---

**让我们开始 pi-mono 的学习之旅吧！**
