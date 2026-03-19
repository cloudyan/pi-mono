# 9. coding-agent-extensions - Extension 扩展系统

> 基于事件的 Extension 架构，扩展 Agent 能力

## 系列概览

本系列深入讲解 `pi-coding-agent` 的 Extension 系统——一个基于事件驱动的扩展机制。与 Hook 系统不同，Extension 通过监听和响应事件来实现功能扩展，支持工具注册、事件拦截和自定义行为。

## 阅读路径

### 核心教程（必读）

1. **[01-extension-events.md](./01-extension-events.md)** - 事件驱动架构
   - 难度：进阶
   - 核心内容：29 种事件类型、事件流、生命周期
   - 预计时间：30 分钟

2. **[02-extension-api.md](./02-extension-api.md)** - Extension API 详解
   - 难度：专家
   - 核心内容：ExtensionAPI 接口、工具注册、事件监听
   - 预计时间：35 分钟

## 学习建议

### 如果你是初学者
1. 先阅读 01-extension-events.md 理解事件概念
2. 参考示例代码理解基本用法
3. 尝试编写简单的 Extension

### 如果你是进阶开发者
1. 重点阅读 02-extension-api.md 的 API 详解
2. 研究 Skill 如何作为 Extension 工作
3. 参考现有 Extension 实现复杂功能

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|-----|------|---------|
| ExtensionEvent | 事件类型，包含 29 种具体事件 | 01 |
| ExtensionAPI | 扩展提供的 API 接口 | 02 |
| ExtensionContext | 扩展运行时上下文 | 02 |
| Tool | 通过 Extension 注册的工具 | 02 |

## 相关资源

- **源码**: `packages/coding-agent/src/core/extensions/` 目录
- **类型定义**: `packages/coding-agent/src/core/extensions/types.ts`
- **实现**: `packages/coding-agent/src/core/extensions/index.ts`
- **Skill 集成**: `packages/coding-agent/src/core/skills.ts`

---

**前置知识**: 需要了解 pi-coding-agent 基础、事件驱动编程
**环境要求**: Node.js 18+, TypeScript

## 与旧版 Hook 系统的区别

| 特性 | Hook 系统（旧版文档） | Extension 系统（实际实现） |
|-----|---------------------|--------------------------|
| 架构 | 同步 Hook 调用 | 异步事件驱动 |
| 扩展方式 | 函数拦截 | 事件监听 + 工具注册 |
| 类型安全 | 较弱 | 完整的 TypeScript 类型 |
| 灵活性 | 有限 | 支持复杂交互 |
| 状态管理 | 无 | 完整的上下文管理 |

> **注意**: 旧版 `7_extension` 文档描述的是 Hook 系统，与实际代码不符。本系列基于实际的 Extension 事件系统编写。
