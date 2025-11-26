/**
 * Agent integration module for "Send to Agent" feature
 *
 * This module provides a manifest-driven approach to AI agent integration.
 * See providers.ts to add support for new agents.
 */

export * from "./promptBuilder"

// New manifest-driven system
export {
	// Provider manifest
	AGENT_PROVIDERS,
	type AgentProvider,
	getProvider,
	getProviderIds,
} from "./providers"

export {
	// Registry
	AgentRegistry,
	getAgentRegistry,
	// Types
	type SendResult,
} from "./registry"

// Note: DetectedAgent is exported from ../types.ts to avoid circular deps
