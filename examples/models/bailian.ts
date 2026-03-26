import type { Model } from "@mariozechner/pi-ai";

/**
 * 百炼 Coding Plan 模型配置
 * 使用 OpenAI 兼容 API 接入阿里云百炼平台
 *
 * 文档: https://help.aliyun.com/zh/model-studio/coding-plan
 * 管理页面: https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan
 *
 * 需要设置环境变量: BAILIAN_API_KEY
 * 获取地址: https://dashscope.aliyun.com/
 */

const baseUrl = "https://coding.dashscope.aliyuncs.com/v1";
const apiResponse = 'openai-completions';
type ModelResponse = Model<"openai-completions">
// const baseUrl = "https://coding.dashscope.aliyuncs.com/apps/anthropic";
// const apiResponse = 'anthropic-messages';
// type ModelResponse = Model<"anthropic-messages">

// Qwen 3.5 Plus - 支持图片理解，上下文 1M
export const qwen35Plus: ModelResponse = {
	id: "qwen3.5-plus",
	name: "qwen3.5-plus",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 1000000,
	maxTokens: 65536,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// Qwen 3 Max - 上下文 262K
export const qwen3Max: ModelResponse = {
	id: "qwen3-max-2026-01-23",
	name: "qwen3-max-2026-01-23",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: true,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 262144,
	maxTokens: 65536,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// Qwen 3 Coder Next - 代码模型
export const qwen3CoderNext: ModelResponse = {
	id: "qwen3-coder-next",
	name: "qwen3-coder-next",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: false,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 262144,
	maxTokens: 65536,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// Qwen 3 Coder Plus - 代码模型，上下文 1M
export const qwen3CoderPlus: ModelResponse = {
	id: "qwen3-coder-plus",
	name: "qwen3-coder-plus",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: false,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 1000000,
	maxTokens: 65536,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// MiniMax M2.5
export const minimaxM25: ModelResponse = {
	id: "MiniMax-M2.5",
	name: "MiniMax-M2.5",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: true,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 196608,
	maxTokens: 32768,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// GLM 5
export const glm5: ModelResponse = {
	id: "glm-5",
	name: "glm-5",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: true,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 202752,
	maxTokens: 16384,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// GLM 4.7
export const glm47: ModelResponse = {
	id: "glm-4.7",
	name: "glm-4.7",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: true,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 202752,
	maxTokens: 16384,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// Kimi K2.5 - 支持图片理解
export const kimiK25: ModelResponse = {
	id: "kimi-k2.5",
	name: "kimi-k2.5",
	api: apiResponse,
	provider: "bailian-coding-plan",
	baseUrl,
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 262144,
	maxTokens: 32768,
	compat: {
		thinkingFormat: "qwen",
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	},
};

// 所有模型
export const allBailianModels = [
	// 推荐
	qwen35Plus,
	kimiK25,
	glm5,
	minimaxM25,
	// 其他
	qwen3Max,
	qwen3CoderNext,
	qwen3CoderPlus,
	glm47,
];

// 根据模型 ID 获取模型配置
export function getBailianModel(modelId: string): ModelResponse | undefined {
	return allBailianModels.find((m) => m.id === modelId);
}

// 默认模型（与配置中的 primary 一致）
export const defaultBailianModel = qwen35Plus;
