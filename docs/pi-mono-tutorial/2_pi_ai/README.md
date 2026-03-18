# pi-ai 深入浅出系列教程

> 从入门到专家，全面理解 pi-ai 的设计哲学与实现原理

## 系列概览

本系列教程带你深入理解 `@mariozechner/pi-ai` —— 一个支持 20+ LLM Provider 的统一 API 库。

不同于简单的 API 文档，本系列**从架构设计到实现细节**，帮助你理解：
- 为什么这样设计？
- 底层原理是什么？
- 如何在实际项目中应用？

## 阅读路径

### 核心教程（必读）

按顺序阅读，循序渐进：

1. **[01-architecture.md](01-architecture.md)** - 架构设计：如何统一 20+ LLM Provider？
   - 难度：入门
   - 核心内容：四层架构、延迟加载、统一事件流协议
   - 预计时间：15 分钟

2. **[02-type-system.md](02-type-system.md)** - 类型系统深度解析
   - 难度：进阶
   - 核心内容：五层类型系统、泛型约束、条件类型
   - 预计时间：20 分钟

3. **[03-provider-registry.md](03-provider-registry.md)** - Provider 注册机制与延迟加载
   - 难度：进阶
   - 核心内容：延迟加载实现、流转发、错误隔离
   - 预计时间：25 分钟

4. **[04-streaming-events.md](04-streaming-events.md)** - 流式事件处理与 EventStream
   - 难度：进阶
   - 核心内容：双向流控制、使用模式、性能优化
   - 预计时间：25 分钟

### API 参考（按需查阅）

5. **[09-api-reference.md](09-api-reference.md)** - 完整 API 参考
   - 难度：参考
   - 核心内容：所有 API、选项、事件类型的完整说明
   - 用途：开发时查阅

### 进阶主题（选读）

5. **[05-message-transform.md](05-message-transform.md)** - 消息格式转换的深入讲解
   - 难度：进阶
   - 核心内容：不同 Provider 的消息格式差异、转换实现、兼容性处理
   - 预计时间：20 分钟

6. **[06-error-handling.md](06-error-handling.md)** - 错误处理与终止机制
   - 难度：进阶
   - 核心内容：错误类型、取消请求、错误恢复、最佳实践
   - 预计时间：15 分钟

7. **[07-cross-provider-handoff.md](07-cross-provider-handoff.md)** - 跨 Provider 切换实现
   - 难度：进阶
   - 核心内容：切换规则、思考块转换、故障转移、成本优化
   - 预计时间：15 分钟

8. **[08-advanced-patterns.md](08-advanced-patterns.md)** - 高级使用模式与最佳实践
   - 难度：专家
   - 核心内容：Agent Loop、状态管理、流式 UI、性能优化、安全实践
   - 预计时间：20 分钟

## 学习建议

### 如果你是初学者

1. 先读 **01-architecture.md**，理解整体架构
2. 尝试运行示例代码
3. 遇到问题查阅 **09-api-reference.md**
4. 需要深入时再读其他章节

### 如果你是进阶开发者

1. 快速浏览 **01-architecture.md**
2. 重点阅读 **02-type-system.md** 和 **03-provider-registry.md**
3. 研究 **04-streaming-events.md** 的实现细节
4. 参考 **09-api-reference.md** 进行开发

### 如果你想贡献代码

1. 完整阅读前 4 章
2. 阅读实际源码（`packages/ai/src/`）
3. 理解测试用例（`packages/ai/test/`）
4. 参考 **09-api-reference.md** 的"添加新 Provider"章节

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|-----|------|---------|
| **延迟加载** | 按需加载 Provider，减小包体积 | 01, 03 |
| **EventStream** | 双向流控制，支持 push 和 async iterator | 01, 04 |
| **Model<TApi>** | 泛型模型，类型安全的 Provider 选择 | 02 |
| **AssistantMessageEvent** | 统一事件协议 | 02, 04 |
| **Context** | 可序列化的对话上下文 | 02, 09 |
| **跨 Provider 切换** | 在同一会话中切换不同 Provider | 09 |

## 代码示例

### 基础使用

```typescript
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4o-mini");
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}
```

### 跨 Provider 切换

```typescript
import { getModel, complete, Context } from "@mariozechner/pi-ai";

const context: Context = {
  messages: [{ role: "user", content: "What is TypeScript?" }],
};

// 先用 Claude
const claude = getModel("anthropic", "claude-sonnet-4-20250514");
const claudeResponse = await complete(claude, context);
context.messages.push(claudeResponse);

// 再切换到 GPT
const gpt = getModel("openai", "gpt-4o");
context.messages.push({ role: "user", content: "Give me an example" });
const gptResponse = await complete(gpt, context);
```

## 相关资源

- **源码**: `packages/ai/` 目录
- **测试**: `packages/ai/test/` 目录
- **原始 README**: `packages/ai/README.md`
- **npm 包**: `@mariozechner/pi-ai`

## 贡献

如果你发现文档有误或想补充内容，欢迎：
1. 提交 Issue 指出问题
2. 提交 PR 改进文档
3. 在讨论区分享你的理解

## 许可

本文档与 pi-ai 项目采用相同的 MIT 许可。

---

**开始阅读**: [01-architecture.md](01-architecture.md)

**快速查阅**: [09-api-reference.md](09-api-reference.md)
