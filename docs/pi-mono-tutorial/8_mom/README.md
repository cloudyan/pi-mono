# 8. mom - Slack Bot 与 Agent 编排

> 在 Slack 中运行 AI Agent，支持多模型、多技能、安全沙箱

## 系列概览

本系列带你深入理解 `mom` —— 一个强大的 Slack Bot，它将 AI Agent 引入团队沟通渠道。支持多模型切换、技能扩展、事件驱动架构和 Docker 沙箱隔离。

## 阅读路径

### 核心教程（必读）

1. **[00-README-zh.md](./00-README-zh.md)** - 官方 README 中文翻译
   - 难度：入门
   - 核心内容：安装、快速开始、配置说明
   - 预计时间：15 分钟

2. **[01-mom-architecture.md](./01-mom-architecture.md)** - 架构与核心概念
   - 难度：进阶
   - 核心内容：整体架构、数据流、核心组件
   - 预计时间：30 分钟

3. **[02-skill-system.md](./02-skill-system.md)** - Skill 系统详解
   - 难度：进阶
   - 核心内容：SKILL.md 格式、技能加载、动态注入
   - 预计时间：35 分钟

4. **[03-events-system.md](./03-events-system.md)** - 事件系统
   - 难度：专家
   - 核心内容：事件类型、调度机制、处理器
   - 预计时间：25 分钟

5. **[04-security-guide.md](./04-security-guide.md)** - 安全指南
   - 难度：进阶
   - 核心内容：Docker 沙箱、权限控制、最佳实践
   - 预计时间：20 分钟

## 学习建议

### 如果你是初学者
1. 先阅读 00-README-zh.md 了解整体功能
2. 阅读 01-mom-architecture.md 理解架构
3. 跟随示例部署自己的 mom 实例

### 如果你是进阶开发者
1. 快速浏览 00-README-zh.md
2. 重点阅读 02-skill-system.md 了解如何扩展功能
3. 参考 03-events-system.md 理解事件驱动设计

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|-----|------|---------|
| Skill | 基于 SKILL.md 的功能扩展单元 | 02 |
| Event | 事件驱动架构中的消息单元 | 03 |
| Sandbox | Docker/Host 代码执行环境 | 04 |
| Context | 会话上下文管理 | 01 |
| Store | 数据持久化层 | 01 |

## 相关资源

- **源码**: `packages/mom/` 目录
- **测试**: `packages/mom/test/` 目录
- **示例 Skill**: `packages/mom/skills/` 目录
- **Slack API**: [Slack Bolt Framework](https://slack.dev/bolt-js/)

---

**前置知识**: 需要了解 Slack Bot、Docker、Node.js
**环境要求**: Node.js 18+, Docker, Slack App Token
