# 开发

更多规范请参阅 [AGENTS.md](../../../AGENTS.md)。

## 环境配置

```bash
git clone https://github.com/badlogic/pi-mono
cd pi-mono
npm install
npm run build
```

从源码运行：

```bash
./pi-test.sh
```

## Fork 与重命名

通过 `package.json` 配置：

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

修改 `name`、`configDir` 和 `bin` 字段以适配你的 fork（分支版本）。这些配置会影响 CLI 横幅、配置路径和环境变量名称。

## 路径解析

三种执行模式：npm install、独立二进制文件、tsx 从源码运行。

**始终使用 `src/config.ts`** 处理包资源：

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

不要直接使用 `__dirname` 处理包资源。

## 调试命令

`/debug`（隐藏命令）会写入 `~/.pi/agent/pi-debug.log`：
- 渲染的 TUI（Terminal User Interface，终端用户界面）行及 ANSI 转义码
- 发送给 LLM（Large Language Model，大语言模型）的最后几条消息

## 测试

```bash
./test.sh                         # 运行非 LLM 测试（无需 API 密钥）
npm test                          # 运行所有测试
npm test -- test/specific.test.ts # 运行指定测试
```

## 项目结构

```
packages/
  ai/           # LLM 提供者抽象层
  agent/        # Agent 循环和消息类型
  tui/          # 终端 UI 组件
  coding-agent/ # CLI 和交互模式
```