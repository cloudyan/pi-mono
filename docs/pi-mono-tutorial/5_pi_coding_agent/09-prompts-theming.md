# 16. 提示模板与主题定制

> 状态说明：这是一篇定制化能力的专题文章，和主线教程存在部分交叉。
> 主线里的 [06-advanced-features.md](06-advanced-features.md) 已经补入 Prompt / Theme / 模型定制的总览；如果你想看更细的展开，再按需阅读本文。

问下大家，你有没有想过，编码助手的"个性"是怎么实现的？

OpenClaw 刚开始以为就是简单的系统提示，但深入了解 pi-coding-agent 后发现，它的提示系统非常灵活：
- **提示模板** - 可定制的系统提示
- **主题系统** - 终端颜色、样式定制
- **模型切换** - 支持不同模型和推理级别

今天我们就来深入理解 pi-coding-agent 的提示和主题系统。

## 提示模板系统

### 为什么需要提示模板？

不同的使用场景需要不同的"个性"：
- **代码审查** - 严格、注重细节
- **代码生成** - 创造性、注重实现
- **问题解答** - 耐心、注重解释
- **调试助手** - 分析性、注重逻辑

### 提示模板结构

```typescript
// packages/coding-agent/src/prompts/types.ts

export interface PromptTemplate {
  /** 模板名称 */
  name: string;
  
  /** 模板描述 */
  description: string;
  
  /** 系统提示 */
  systemPrompt: string;
  
  /** 上下文提示（可选） */
  contextPrompt?: string;
  
  /** 工具使用提示（可选） */
  toolPrompt?: string;
  
  /** 变量替换 */
  variables?: Record<string, string>;
}
```

### 内置提示模板

```typescript
// packages/coding-agent/src/prompts/templates.ts

export const defaultPromptTemplate: PromptTemplate = {
  name: "default",
  description: "Default coding assistant",
  systemPrompt: `You are a helpful coding assistant.
You can read and write files, execute bash commands, and use git.
Always be concise and helpful.
When writing code, follow best practices and include comments.`,
  toolPrompt: `You have access to the following tools:
- read_file: Read file contents
- write_file: Write to a file
- bash: Execute bash commands
- git: Execute git commands

Use these tools when needed to help the user.`,
};

export const codeReviewTemplate: PromptTemplate = {
  name: "code-review",
  description: "Code reviewer - strict and detailed",
  systemPrompt: `You are a code reviewer. Your job is to review code and provide feedback.
Be strict and thorough. Check for:
- Code style and formatting
- Potential bugs
- Security issues
- Performance problems
- Best practices violations

Provide specific line-by-line feedback when possible.`,
};

export const architectTemplate: PromptTemplate = {
  name: "architect",
  description: "Software architect - high-level design",
  systemPrompt: `You are a software architect. Your job is to design systems and make high-level decisions.
Focus on:
- Architecture patterns
- Technology choices
- Trade-offs
- Scalability
- Maintainability

Provide detailed explanations of your design decisions.`,
};
```

### 提示模板管理器

```typescript
// packages/coding-agent/src/prompts/prompt-manager.ts

export class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private currentTemplate: string = "default";
  
  constructor() {
    // 注册内置模板
    this.registerTemplate(defaultPromptTemplate);
    this.registerTemplate(codeReviewTemplate);
    this.registerTemplate(architectTemplate);
  }
  
  /**
   * 注册模板
   */
  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }
  
  /**
   * 获取模板
   */
  getTemplate(name: string): PromptTemplate {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }
    return template;
  }
  
  /**
   * 列出所有模板
   */
  listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
  
  /**
   * 设置当前模板
   */
  setCurrentTemplate(name: string): void {
    if (!this.templates.has(name)) {
      throw new Error(`Template ${name} not found`);
    }
    this.currentTemplate = name;
  }
  
  /**
   * 获取当前模板
   */
  getCurrentTemplate(): PromptTemplate {
    return this.getTemplate(this.currentTemplate);
  }
  
  /**
   * 渲染系统提示
   */
  renderSystemPrompt(): string {
    const template = this.getCurrentTemplate();
    let prompt = template.systemPrompt;
    
    // 变量替换
    if (template.variables) {
      for (const [key, value] of Object.entries(template.variables)) {
        prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
      }
    }
    
    // 添加工具提示
    if (template.toolPrompt) {
      prompt += "\n\n" + template.toolPrompt;
    }
    
    return prompt;
  }
}
```

### 动态变量

```typescript
// 使用变量
const template: PromptTemplate = {
  name: "custom",
  description: "Custom template with variables",
  systemPrompt: `You are a {{role}} specializing in {{language}}.
Your style is {{style}}.`,
  variables: {
    role: "backend developer",
    language: "Node.js",
    style: "pragmatic",
  },
};

// 渲染后：
// You are a backend developer specializing in Node.js.
// Your style is pragmatic.
```

## 主题系统

### 主题结构

```typescript
// packages/coding-agent/src/theme/types.ts

export interface Theme {
  /** 主题名称 */
  name: string;
  
  /** 颜色定义 */
  colors: ThemeColors;
  
  /** 样式定义 */
  styles: ThemeStyles;
  
  /** 组件样式 */
  components: ComponentStyles;
}

export interface ThemeColors {
  /** 前景色 */
  foreground: string;
  
  /** 背景色 */
  background: string;
  
  /** 强调色 */
  accent: string;
  
  /** 成功色 */
  success: string;
  
  /** 警告色 */
  warning: string;
  
  /** 错误色 */
  error: string;
  
  /** 次要文字 */
  muted: string;
  
  /** 边框 */
  border: string;
}

export interface ThemeStyles {
  /** 用户消息样式 */
  userMessage: Style;
  
  /** 助手消息样式 */
  assistantMessage: Style;
  
  /** 系统消息样式 */
  systemMessage: Style;
  
  /** 工具调用样式 */
  toolCall: Style;
  
  /** 代码块样式 */
  codeBlock: Style;
  
  /** 引用样式 */
  quote: Style;
}

export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}
```

### 内置主题

```typescript
// packages/coding-agent/src/theme/themes.ts

export const defaultTheme: Theme = {
  name: "default",
  colors: {
    foreground: "#ffffff",
    background: "#1a1a1a",
    accent: "#3b82f6",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    muted: "#6b7280",
    border: "#374151",
  },
  styles: {
    userMessage: { fg: "#3b82f6", bold: true },
    assistantMessage: { fg: "#ffffff" },
    systemMessage: { fg: "#6b7280", italic: true },
    toolCall: { fg: "#22c55e" },
    codeBlock: { fg: "#e5e7eb", bg: "#1f2937" },
    quote: { fg: "#9ca3af", italic: true },
  },
  components: {
    // 组件特定样式
  },
};

export const lightTheme: Theme = {
  name: "light",
  colors: {
    foreground: "#1f2937",
    background: "#ffffff",
    accent: "#2563eb",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
    muted: "#6b7280",
    border: "#e5e7eb",
  },
  styles: {
    userMessage: { fg: "#2563eb", bold: true },
    assistantMessage: { fg: "#1f2937" },
    systemMessage: { fg: "#6b7280", italic: true },
    toolCall: { fg: "#16a34a" },
    codeBlock: { fg: "#1f2937", bg: "#f3f4f6" },
    quote: { fg: "#6b7280", italic: true },
  },
  components: {},
};

export const highContrastTheme: Theme = {
  name: "high-contrast",
  colors: {
    foreground: "#ffffff",
    background: "#000000",
    accent: "#00ffff",
    success: "#00ff00",
    warning: "#ffff00",
    error: "#ff0000",
    muted: "#808080",
    border: "#ffffff",
  },
  styles: {
    userMessage: { fg: "#00ffff", bold: true },
    assistantMessage: { fg: "#ffffff" },
    systemMessage: { fg: "#808080", bold: true },
    toolCall: { fg: "#00ff00" },
    codeBlock: { fg: "#ffffff", bg: "#000000" },
    quote: { fg: "#808080" },
  },
  components: {},
};
```

### 主题管理器

```typescript
// packages/coding-agent/src/theme/theme-manager.ts

export class ThemeManager {
  private themes: Map<string, Theme> = new Map();
  private currentTheme: string = "default";
  
  constructor() {
    // 注册内置主题
    this.registerTheme(defaultTheme);
    this.registerTheme(lightTheme);
    this.registerTheme(highContrastTheme);
  }
  
  /**
   * 注册主题
   */
  registerTheme(theme: Theme): void {
    this.themes.set(theme.name, theme);
  }
  
  /**
   * 获取主题
   */
  getTheme(name: string): Theme {
    const theme = this.themes.get(name);
    if (!theme) {
      throw new Error(`Theme ${name} not found`);
    }
    return theme;
  }
  
  /**
   * 列出所有主题
   */
  listThemes(): Theme[] {
    return Array.from(this.themes.values());
  }
  
  /**
   * 设置当前主题
   */
  setCurrentTheme(name: string): void {
    if (!this.themes.has(name)) {
      throw new Error(`Theme ${name} not found`);
    }
    this.currentTheme = name;
  }
  
  /**
   * 获取当前主题
   */
  getCurrentTheme(): Theme {
    return this.getTheme(this.currentTheme);
  }
  
  /**
   * 应用样式
   */
  applyStyle(text: string, style: Style): string {
    let result = text;
    
    if (style.bold) {
      result = `\x1b[1m${result}\x1b[22m`;
    }
    if (style.italic) {
      result = `\x1b[3m${result}\x1b[23m`;
    }
    if (style.underline) {
      result = `\x1b[4m${result}\x1b[24m`;
    }
    if (style.fg) {
      const colorCode = this.hexToAnsi(style.fg);
      result = `\x1b[38;5;${colorCode}m${result}\x1b[39m`;
    }
    if (style.bg) {
      const colorCode = this.hexToAnsi(style.bg);
      result = `\x1b[48;5;${colorCode}m${result}\x1b[49m`;
    }
    
    return result;
  }
  
  /**
   * 将十六进制颜色转换为 ANSI 颜色码
   */
  private hexToAnsi(hex: string): number {
    // 简化实现，实际需要更复杂的颜色映射
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    // 转换为 256 色
    if (r === g && g === b) {
      // 灰度
      if (r < 8) return 16;
      if (r > 248) return 231;
      return Math.round(((r - 8) / 247) * 24) + 232;
    }
    
    // 彩色
    const rIndex = Math.round(r / 51);
    const gIndex = Math.round(g / 51);
    const bIndex = Math.round(b / 51);
    
    return 16 + (rIndex * 36) + (gIndex * 6) + bIndex;
  }
}
```

## 模型与思考级别

### 模型配置

```typescript
// packages/coding-agent/src/core/model-config.ts

export interface ModelConfig {
  /** 模型标识 */
  model: string;
  
  /** 提供商 */
  provider: string;
  
  /** 上下文窗口 */
  contextWindow: number;
  
  /** 是否支持工具调用 */
  supportsTools: boolean;
  
  /** 是否支持思考/推理 */
  supportsThinking: boolean;
}

export const availableModels: ModelConfig[] = [
  {
    model: "gpt-4o",
    provider: "openai",
    contextWindow: 128000,
    supportsTools: true,
    supportsThinking: false,
  },
  {
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    contextWindow: 200000,
    supportsTools: true,
    supportsThinking: true,
  },
  {
    model: "claude-3-7-sonnet-20250219",
    provider: "anthropic",
    contextWindow: 200000,
    supportsTools: true,
    supportsThinking: true,
  },
];
```

### 思考级别

```typescript
export type ThinkingLevel = "none" | "low" | "medium" | "high";

export interface ThinkingConfig {
  level: ThinkingLevel;
  budget?: number;  // Token 预算（Anthropic）
}

export function getThinkingBudget(level: ThinkingLevel): number | undefined {
  switch (level) {
    case "none":
      return undefined;
    case "low":
      return 1000;
    case "medium":
      return 4000;
    case "high":
      return 16000;
  }
}
```

### 运行时切换

```typescript
// packages/coding-agent/src/core/agent-session.ts

export class AgentSession {
  private currentModel: string = "openai/gpt-4o";
  private currentThinkingLevel: ThinkingLevel = "none";
  
  /**
   * 切换模型
   */
  async switchModel(model: string): Promise<void> {
    // 验证模型是否可用
    if (!this.isModelAvailable(model)) {
      throw new Error(`Model ${model} is not available`);
    }
    
    this.currentModel = model;
    
    // 记录模型变更
    this.sessionManager.addEntry({
      type: "model_change",
      data: {
        fromModel: this.currentModel,
        toModel: model,
      },
    });
  }
  
  /**
   * 设置思考级别
   */
  setThinkingLevel(level: ThinkingLevel): void {
    this.currentThinkingLevel = level;
    
    // 记录思考级别变更
    this.sessionManager.addEntry({
      type: "thinking_level_change",
      data: {
        level,
        budget: getThinkingBudget(level),
      },
    });
  }
  
  /**
   * 运行 Agent
   */
  async *run(): AsyncGenerator<AgentMessageEvent> {
    const options: StreamOptions = {
      api: this.currentModel,
      messages: this.getMessages(),
      tools: this.getTools(),
    };
    
    // 如果支持思考
    if (this.currentThinkingLevel !== "none") {
      const budget = getThinkingBudget(this.currentThinkingLevel);
      if (budget) {
        options.thinkingBudget = budget;
      }
    }
    
    const stream = stream(this.currentModel, options);
    
    for await (const event of stream) {
      yield event;
    }
  }
}
```

## 配置文件集成

### 完整配置示例

```json
// ~/.config/pi/config.json
{
  "api": "openai/gpt-4o",
  "model": "gpt-4o",
  "thinkingLevel": "none",
  
  "prompt": {
    "template": "default",
    "variables": {
      "role": "full-stack developer",
      "style": "pragmatic"
    }
  },
  
  "theme": {
    "name": "default",
    "custom": {
      "colors": {
        "accent": "#ff6b6b"
      }
    }
  },
  
  "ui": {
    "showThinking": false,
    "showTokenCount": true,
    "compactThreshold": 50
  },
  
  "extensions": [
    "@pi/extension-git",
    "@pi/extension-docker"
  ]
}
```

### 配置加载

```typescript
// packages/coding-agent/src/config.ts

export async function loadConfig(): Promise<Config> {
  const configPath = path.join(os.homedir(), ".config", "pi", "config.json");
  
  let config = defaultConfig;
  
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const userConfig = JSON.parse(content);
    config = mergeConfigs(defaultConfig, userConfig);
  } catch {
    // 使用默认配置
  }
  
  // 应用配置
  applyConfig(config);
  
  return config;
}

function applyConfig(config: Config): void {
  // 设置提示模板
  if (config.prompt?.template) {
    promptManager.setCurrentTemplate(config.prompt.template);
  }
  
  // 设置变量
  if (config.prompt?.variables) {
    const template = promptManager.getCurrentTemplate();
    template.variables = { ...template.variables, ...config.prompt.variables };
  }
  
  // 设置主题
  if (config.theme?.name) {
    themeManager.setCurrentTheme(config.theme.name);
  }
  
  // 应用自定义主题
  if (config.theme?.custom) {
    const theme = themeManager.getCurrentTheme();
    mergeThemeCustomizations(theme, config.theme.custom);
  }
}
```

## UI 集成

### 主题切换 UI

```typescript
async function showThemeSwitcher(): Promise<void> {
  const themes = themeManager.listThemes();
  
  const items = themes.map(t => ({
    label: t.name,
    description: t.description || "",
    value: t.name,
  }));
  
  const selector = new SelectList({
    items,
    onSelect: (item) => {
      themeManager.setCurrentTheme(item.value);
      tui.render();  // 重新渲染以应用新主题
    },
  });
  
  tui.showOverlay(selector);
}
```

### 模型切换 UI

```typescript
async function showModelSwitcher(): Promise<void> {
  const models = [
    { label: "GPT-4o", value: "openai/gpt-4o" },
    { label: "Claude 3.5 Sonnet", value: "anthropic/claude-3-5-sonnet-20241022" },
    { label: "Claude 3.7 Sonnet", value: "anthropic/claude-3-7-sonnet-20250219" },
  ];
  
  const selector = new SelectList({
    items: models,
    onSelect: async (item) => {
      await session.switchModel(item.value);
      footer.showMessage(`Switched to ${item.label}`);
    },
  });
  
  tui.showOverlay(selector);
}
```

## 总结

pi-coding-agent 的提示和主题系统非常灵活：

1. **提示模板** - 可定制的系统提示，支持变量替换
2. **主题系统** - 完整的颜色和样式定制
3. **模型切换** - 支持不同模型和推理级别
4. **配置集成** - 通过配置文件持久化设置
5. **UI 集成** - 提供切换界面

这种设计让用户能够根据自己的喜好定制编码助手的行为和外观。

---

**至此，pi-coding-agent 篇章完成！** 接下来可以进入 pi-web-ui 或其他主题的教程。
