// Extracts thinking/thinking blocks from assistant message content.
// These blocks appear when providers like MiniMax output thinking tags in their response text
// instead of using the structured reasoning events.

const THINKING_BLOCK_REGEX = /<thought>([\s\S]*?)<\/thought>/g;

export interface ThinkingBlock {
	thinking: string;
}

export interface ExtractThinkingBlocksResult {
	blocks: ThinkingBlock[];
	/** The original content with all thinking block tags removed */
	remainingContent: string;
}

/**
 * Extract all thinking blocks from content and return the cleaned content.
 * Standard Claude format: <thought>...</thought>
 */
export function extractThinkingBlocks(content: string): ExtractThinkingBlocksResult {
	if (typeof content !== "string" || content.length === 0) {
		return { blocks: [], remainingContent: content };
	}

	const blocks: ThinkingBlock[] = [];
	const remainingContent = content.replace(THINKING_BLOCK_REGEX, (_, thinking) => {
		const trimmed = thinking.trim();
		if (trimmed.length > 0) {
			blocks.push({ thinking: trimmed });
		}
		return "";
	});

	return { blocks, remainingContent };
}

/**
 * Check if content contains any thinking blocks.
 */
export function hasThinkingBlocks(content: string): boolean {
	if (typeof content !== "string" || content.length === 0) {
		return false;
	}
	return THINKING_BLOCK_REGEX.test(content);
}
