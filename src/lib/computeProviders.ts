export interface ComputeProvider {
  name: string;
  model: string;
  url: string;
}

// Synced from mainnet compute services on 2026-03-05.
export const COMPUTE_PROVIDERS: ComputeProvider[] = [
  { name: 'glm-5-fp8', model: 'zai-org/GLM-5-FP8', url: 'https://compute-network-1.integratenetwork.work' },
  { name: 'whisper-large-v3', model: 'openai/whisper-large-v3', url: 'https://39.97.249.15:8889' },
  { name: 'gpt-oss-120b', model: 'openai/gpt-oss-120b', url: 'https://compute-network-2.integratenetwork.work' },
  { name: 'qwen-vl-30b', model: 'qwen/qwen3-vl-30b-a3b-instruct', url: 'https://compute-network-3.integratenetwork.work' },
  { name: 'deepseek-chat-v3', model: 'deepseek/deepseek-chat-v3-0324', url: 'https://compute-network-4.integratenetwork.work' },
  { name: 'z-image', model: 'z-image', url: 'https://39.97.249.15:8888' },
  { name: 'gpt-oss-20b', model: 'openai/gpt-oss-20b', url: 'https://compute-network-5.integratenetwork.work' },
];
