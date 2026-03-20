# 实现计划

## 核心原则
- 全程使用 TypeScript
- 简洁、最小化的代码
- 自包含模块
- 直接 SSH 执行（无远程管理器）
- 所有状态存储在本地 JSON

## 包 1: Pod 设置脚本生成
通过 SSH 生成并执行 pod_setup.sh

- [ ] `src/setup/generate-setup-script.ts` - 将 bash 脚本生成为字符串
  - [ ] 检测 CUDA 驱动版本
  - [ ] 确定所需的 CUDA 工具包版本
  - [ ] 生成 uv/Python 安装命令
  - [ ] 生成虚拟环境(venv)创建命令
  - [ ] 生成 pip 安装命令（torch、vLLM 等）
  - [ ] 处理模型特定的 vLLM 版本（例如, gpt-oss 需要 0.10.1+gptoss）
  - [ ] 如果提供了 `--mount` 参数, 则生成挂载命令
  - [ ] 生成环境变量设置（HF_TOKEN、PI_API_KEY）

- [ ] `src/setup/detect-hardware.ts` - 运行 nvidia-smi 并解析 GPU 信息
  - [ ] 通过 SSH 执行 nvidia-smi
  - [ ] 解析 GPU 数量、名称、内存
  - [ ] 返回结构化的 GPU 信息

- [ ] `src/setup/execute-setup.ts` - 主设置协调器
  - [ ] 生成设置脚本
  - [ ] 通过 SSH 复制并执行
  - [ ] 将输出流式传输到控制台
  - [ ] 正确处理 Ctrl+C
  - [ ] 将 GPU 信息保存到本地配置

## 包 2: 配置管理
本地 JSON 状态管理

- [ ] `src/config/types.ts` - TypeScript 接口
  - [ ] Pod 接口（ssh、gpus、models、mount）
  - [ ] Model 接口（model、port、gpu、pid）
  - [ ] GPU 接口（id、name、memory）

- [ ] `src/config/store.ts` - 读写 `~/.pi/pods.json`
  - [ ] 加载配置（处理缺失文件）
  - [ ] 保存配置（原子写入）
  - [ ] 获取活动 pod
  - [ ] 添加/删除 pods
  - [ ] 更新模型状态

## 包 3: SSH 执行器
干净的 SSH 命令执行

- [ ] `src/ssh/executor.ts` - SSH 命令包装器
  - [ ] 使用流式输出执行命令
  - [ ] 使用捕获的输出执行命令
  - [ ] 优雅处理 SSH 错误
  - [ ] 支持 Ctrl+C 传播
  - [ ] 支持后台进程（nohup）

## 包 4: Pod 命令
Pod 管理 CLI 命令

- [ ] `src/commands/pods-setup.ts` - `pi pods setup`
  - [ ] 解析参数（name、ssh、mount）
  - [ ] 检查环境变量（HF_TOKEN、PI_API_KEY）
  - [ ] 调用设置执行器
  - [ ] 将 pod 保存到配置

- [ ] `src/commands/pods-list.ts` - `pi pods`
  - [ ] 加载配置
  - [ ] 显示所有 pods 并标记活动状态

- [ ] `src/commands/pods-active.ts` - `pi pods active`
  - [ ] 切换活动 pod
  - [ ] 更新配置

- [ ] `src/commands/pods-remove.ts` - `pi pods remove`
  - [ ] 从配置中移除（不远程删除）

## 包 5: 模型管理
模型生命周期管理

- [ ] `src/models/model-config.ts` - 已知模型配置
  - [ ] 加载 `models.md` 数据结构
  - [ ] 将硬件与 vLLM 参数匹配
  - [ ] 获取模型特定的环境变量

- [ ] `src/models/download.ts` - 通过 HF 下载模型
  - [ ] 检查模型是否已缓存
  - [ ] 运行 `huggingface-cli download`
  - [ ] 将进度流式传输到控制台
  - [ ] 处理 Ctrl+C

- [ ] `src/models/vllm-builder.ts` - 构建 vLLM 命令
  - [ ] 获取模型的基础命令
  - [ ] 添加硬件特定的参数
  - [ ] 添加用户自定义的 `--vllm` 参数
  - [ ] 添加端口和 API 密钥

## 包 6: 模型命令
模型管理 CLI 命令

- [ ] `src/commands/start.ts` - `pi start`
  - [ ] 解析模型和参数
  - [ ] 查找下一个可用端口
  - [ ] 选择 GPU（轮询）
  - [ ] 如果需要则下载模型
  - [ ] 构建并执行 vLLM 命令
  - [ ] 等待健康检查
  - [ ] 成功时更新配置

- [ ] `src/commands/stop.ts` - `pi stop`
  - [ ] 在配置中查找模型
  - [ ] 通过 PID 终止进程
  - [ ] 清理配置

- [ ] `src/commands/list.ts` - `pi list`
  - [ ] 显示配置中的模型
  - [ ] 可选验证 PID

- [ ] `src/commands/logs.ts` - `pi logs`
  - [ ] 通过 SSH 跟踪日志文件
  - [ ] 处理 Ctrl+C（仅停止跟踪）

## 包 7: 模型测试
使用工具的快速模型测试

- [ ] `src/prompt/tools.ts` - 工具定义
  - [ ] 定义 `ls`、`read`、`glob`、`rg` 工具
  - [ ] 为 OpenAI API 格式化

- [ ] `src/prompt/client.ts` - OpenAI 客户端包装器
  - [ ] 为模型端点创建客户端
  - [ ] 处理流式响应
  - [ ] 显示思考过程、工具、内容

- [ ] `src/commands/prompt.ts` - `pi prompt`
  - [ ] 从配置获取模型端点
  - [ ] 使用当前工作目录(CWD)信息增强提示
  - [ ] 使用工具发送请求
  - [ ] 显示格式化响应

## 包 8: CLI 入口点
使用 commander.js 的主 CLI

- [ ] `src/cli.ts` - 主入口点
  - [ ] 设置 commander 程序
  - [ ] 注册所有命令
  - [ ] 处理全局选项（`--pod` 覆盖）
  - [ ] 错误处理

- [ ] `src/index.ts` - 包导出

## 测试策略
- [ ] 本地测试 `pod_setup.sh` 生成
- [ ] 在带 GPU 的本地机器上测试
- [ ] 使用模拟命令测试 SSH 执行器
- [ ] 使用临时文件测试配置管理
- [ ] 在真实 pod 上进行集成测试

## 依赖项
```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "@commander-js/extra-typings": "^12.0.0",
    "openai": "^4.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

## 构建与分发
- [ ] 为 Node.js 目标配置 TypeScript
- [ ] 构建到 `dist/` 目录
- [ ] 带有 bin 条目的 npm 包
- [ ] npx 支持