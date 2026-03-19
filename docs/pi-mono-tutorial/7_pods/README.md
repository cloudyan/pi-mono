# 7. pi - GPU Pod 上的 LLM 部署与管理

> 在远程 GPU 服务器上部署和管理大语言模型

## 系列概览

本系列带你掌握 `pi` 工具的使用——一个简化在 GPU Pod 上运行大语言模型的命令行工具。它自动配置 vLLM、管理多模型部署、提供 OpenAI 兼容的 API 端点。

## 阅读路径

### 核心教程（必读）

1. **[00-README-zh.md](./00-README-zh.md)** - 官方 README 中文翻译
   - 难度：入门
   - 核心内容：安装、快速开始、命令概览
   - 预计时间：10 分钟

2. **[01-pod-management.md](./01-pod-management.md)** - Pod 管理基础
   - 难度：入门
   - 核心内容：Pod 配置、SSH 连接、环境初始化
   - 预计时间：20 分钟

3. **[02-model-deployment.md](./02-model-deployment.md)** - 模型部署与配置
   - 难度：进阶
   - 核心内容：模型启动、GPU 分配、配置矩阵
   - 预计时间：30 分钟

4. **[03-agent-interface.md](./03-agent-interface.md)** - Agent 交互模式
   - 难度：进阶
   - 核心内容：Agent 命令、交互式聊天、工具使用
   - 预计时间：25 分钟

## 学习建议

### 如果你是初学者
1. 先阅读 00-README-zh.md 了解整体功能
2. 按顺序阅读 01-03 章节
3. 跟随示例在测试 Pod 上实操

### 如果你是进阶开发者
1. 快速浏览 00-README-zh.md
2. 重点阅读 02-model-deployment.md 的 GPU 分配和配置矩阵
3. 参考 03-agent-interface.md 了解 Agent 集成方式

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|-----|------|---------|
| Pod | GPU 服务器配置，包含 SSH 连接信息 | 01 |
| Model Config | 预定义的模型运行配置（GPU 数、参数等） | 02 |
| vLLM | 大模型推理服务框架 | 02 |
| Agent | 交互式 LLM 客户端，支持工具调用 | 03 |
| Tool Calling | 模型调用外部工具的能力 | 03 |

## 相关资源

- **源码**: `packages/pods/` 目录
- **测试**: `packages/pods/test/` 目录
- **预定义模型**: `packages/pods/src/models.json`
- **安装脚本**: `packages/pods/scripts/`

---

**前置知识**: 需要了解 Linux 基础命令、SSH、Docker 基础
**环境要求**: Node.js 18+, HuggingFace Token, GPU Pod 访问权限
