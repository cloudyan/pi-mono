> pi 可以创建提示词模板。让它为你的工作流构建一个吧。

# 提示词模板

提示词模板（Prompt Templates）是可展开为完整提示词的 Markdown 片段。在编辑器中输入 `/name` 即可调用模板，其中 `name` 是不带 `.md` 后缀的文件名。

## 位置

Pi 从以下位置加载提示词模板：

- 全局：`~/.pi/agent/prompts/*.md`
- 项目：`.pi/prompts/*.md`
- 包：`prompts/` 目录或 `package.json` 中的 `pi.prompts` 条目
- 设置：`prompts` 数组，支持文件或目录
- CLI：`--prompt-template <path>`（可重复使用）

使用 `--no-prompt-templates` 禁用自动发现。

## 格式

```markdown
---
description: Review staged git changes
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
- Error handling gaps
```

- 文件名即为命令名。`review.md` 变为 `/review`。
- `description` 是可选的。如果省略，则使用第一个非空行。

## 用法

在编辑器中输入 `/` 后跟模板名称。自动补全会显示可用模板及其描述。

```
/review                           # 展开 review.md
/component Button                 # 带参数展开
/component Button "click handler" # 多个参数
```

## 参数

模板支持位置参数和简单切片：

- `$1`、`$2`、... 位置参数
- `$@` 或 `$ARGUMENTS` 获取所有参数（连接后）
- `${@:N}` 获取从第 N 个位置开始的参数（从 1 开始索引）
- `${@:N:L}` 获取从 N 开始的 L 个参数

示例：

```markdown
---
description: Create a component
---
Create a React component named $1 with features: $@
```

用法：`/component Button "onClick handler" "disabled support"`

## 加载规则

- `prompts/` 中的模板发现是非递归的。
- 如果你需要子目录中的模板，请通过 `prompts` 设置或包清单（package manifest）显式添加。