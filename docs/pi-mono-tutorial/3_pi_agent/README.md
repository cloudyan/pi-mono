# pi-agent 系列教程

> 深入理解 @mariozechner/pi-agent-core —— 生产级 Agent 运行时

## 系列概览

本系列带你深入理解 pi-agent 的设计原理和最佳实践。pi-agent 是一个**有状态的对话管理器**，在 pi-ai 的基础上提供了：

- ✅ **完整状态管理** —— 维护对话历史、工具列表、模型配置
- ✅ **自动工具执行** —— 支持并行/串行执行、before/after 钩子
- ✅ **实时干预机制** —— Steering/Follow-up 消息队列
- ✅ **细粒度事件流** —— message_start/update/end、tool_execution 等
- ✅ **自定义消息类型** —— 通过 TypeScript 声明合并扩展
- ✅ **灵活的消息转换** —— transformContext + convertToLlm 双层架构

## 阅读路径

### 核心教程（必读）

| 章节 | 难度 | 预计时间 | 核心内容 |
|------|------|---------|---------|
| **[00-README-zh.md](00-README-zh.md)** | 参考 | 10 分钟 | 官方 README 中文翻译，快速了解 pi-agent |
| **[01-core-concepts.md](01-core-concepts.md)** | 入门 | 20 分钟 | AgentMessage、AgentState、事件流、AgentTool |
| **[02-agent-loop.md](02-agent-loop.md)** | 进阶 | 25 分钟 | 双层循环设计、Steering/Follow-up、流式处理 |
| **[03-tool-execution.md](03-tool-execution.md)** | 进阶 | 20 分钟 | 工具执行流程、并行/串行、流式更新、钩子机制 |
| **[04-message-transform.md](04-message-transform.md)** | 进阶 | 20 分钟 | 两层转换、自定义消息、上下文修剪、动态注入 |
| **[05-advanced-patterns.md](05-advanced-patterns.md)** | 专家 | 25 分钟 | 状态持久化、多 Agent 协作、错误恢复、性能优化 |

### 阅读建议

**如果你是初学者**：
1. 按顺序阅读 01 → 02 → 03
2. 每章配合代码示例实践
3. 完成后再阅读 04、05

**如果你是进阶开发者**：
1. 快速浏览 01 了解基本概念
2. 重点阅读 02、03 理解核心机制
3. 04、05 按需查阅

**如果你是专家开发者**：
1. 直接阅读 02、05
2. 参考源码深入理解
3. 贡献最佳实践案例

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|------|------|---------|
| Agent | 有状态的对话管理器 | 01 |
| AgentMessage | 消息抽象，支持自定义类型 | 01 |
| AgentState | 完整状态管理 | 01 |
| AgentTool | 带执行函数的工具定义 | 01、03 |
| AgentLoop | 双层事件循环 | 02 |
| Steering | 实时干预机制 | 02 |
| Follow-up | 跟进消息队列 | 02 |
| transformContext | 上下文转换（可选） | 04 |
| convertToLlm | 消息转换（必需） | 04 |
| CustomAgentMessages | 自定义消息类型扩展 | 04 |

## 与 pi-ai 的关系

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (你的代码)                      │
│              使用 Agent 构建聊天界面、IDE 插件等           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              pi-agent (@mariozechner/pi-agent-core)      │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│    │ Agent   │  │AgentLoop│  │AgentTool│  │ 事件系统 │  │
│    │ 类     │  │ 函数    │  │ 接口    │  │        │  │
│    └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │
└─────────┼────────────┼────────────┼────────────┼────────┘
          │            │            │            │
          └────────────┴────────────┴────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                 pi-ai (@mariozechner/pi-ai)              │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│    │ stream  │  │complete │  │ Message │  │  Event  │  │
│    │ 函数    │  │ 函数    │  │ 类型    │  │ 类型    │  │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 安装

```bash
npm install @mariozechner/pi-agent-core @mariozechner/pi-ai
```

### 基础示例

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

// 订阅事件
agent.subscribe((event) => {
  if (event.type === "message_update" && 
      event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// 发送消息
await agent.prompt("你好，请介绍一下自己");
```

### 带工具的示例

```typescript
import { Type } from "@sinclair/typebox";

const calculatorTool: AgentTool = {
  name: "calculate",
  label: "计算器",
  description: "执行数学计算",
  parameters: Type.Object({
    expression: Type.String(),
  }),
  execute: async (toolCallId, params) => {
    const result = eval(params.expression);  // ⚠️ 仅示例
    return {
      content: [{ type: "text", text: String(result) }],
      details: { expression: params.expression, result },
    };
  },
};

const agent = new Agent({
  initialState: {
    systemPrompt: "你可以使用计算器工具。",
    model: getModel("openai", "gpt-4o-mini"),
    tools: [calculatorTool],
  },
});

await agent.prompt("计算 123 * 456");
```

## 源码位置

- **源码**: `packages/agent/src/` 目录
- **测试**: `packages/agent/test/` 目录
- **类型**: `packages/agent/src/types.ts`
- **核心**: `packages/agent/src/agent.ts`, `packages/agent/src/agent-loop.ts`

## 相关资源

- **pi-ai 系列**: [../2_pi_ai/README.md](../2_pi_ai/README.md)
- **API 参考**: 查看源码中的 JSDoc 注释
- **示例项目**: 参考 `packages/agent/test/` 中的测试用例

## 术语统一表

| 英文术语 | 中文翻译 | 说明 |
|---------|---------|------|
| Agent | Agent/智能体 | 对话管理器 |
| AgentMessage | Agent 消息 | 消息抽象 |
| AgentState | Agent 状态 | 状态管理 |
| AgentTool | Agent 工具 | 带执行函数的工具 |
| AgentLoop | Agent 循环 | 事件循环机制 |
| Steering | 引导 | 实时干预机制 |
| Follow-up | 跟进 | 后续消息处理 |
| Turn | 轮次 | 单次对话循环 |
| Event | 事件 | 状态变更通知 |
| Stream | 流式 | 流式传输 |

## 学习建议

1. **先理解概念，再看代码**
   - 每章先通读理解概念
   - 再对照源码深入理解

2. **动手实践**
   - 每章都有代码示例
   - 建议自己运行一遍

3. **从简单到复杂**
   - 先实现基础对话
   - 再添加工具、自定义消息等

4. **参考测试用例**
   - `packages/agent/test/` 中有丰富的测试用例
   - 是学习 API 用法的最佳参考

## 常见问题

**Q: pi-agent 和 pi-ai 有什么区别？**

A: pi-ai 是底层 LLM 交互库，pi-agent 是在其上构建的有状态对话管理器。pi-agent 提供了状态管理、工具执行、事件流等高级功能。

**Q: 可以只使用 pi-agent 而不使用 pi-ai 吗？**

A: 不可以。pi-agent 依赖 pi-ai 进行 LLM 调用，两者是分层关系。

**Q: 如何扩展自定义消息类型？**

A: 通过 TypeScript 的声明合并扩展 `CustomAgentMessages` 接口，详见 [04-message-transform.md](04-message-transform.md)。

**Q: 如何处理长时间运行的工具？**

A: 使用流式更新回调 `onUpdate`，详见 [03-tool-execution.md](03-tool-execution.md)。

**Q: 如何实现多轮对话？**

A: Agent 自动维护对话历史，只需多次调用 `prompt()` 或 `steer()`，详见 [02-agent-loop.md](02-agent-loop.md)。

---

**开始阅读**: [01-core-concepts.md](01-core-concepts.md)

**最后更新**: 2026-03-19
