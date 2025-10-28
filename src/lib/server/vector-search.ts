import { MilvusClient } from '@zilliz/milvus2-sdk-node';

// Milvus and Llama.cpp configuration
const MILVUS_ADDRESS = process.env.MILVUS_ADDRESS || 'milvus:19530';
const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://llamacpp:8080';

/**
 * Get embedding vector from llama.cpp server (single text)
 */
export async function getEmbedding(text: string): Promise<number[]> {
	const response = await fetch(`${LLAMA_SERVER_URL}/embedding`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ input: text })
	});

	if (!response.ok) {
		throw new Error(`Failed to get embedding: ${response.statusText}`);
	}

	const data = await response.json();
	return data[0].embedding;
}

/**
 * Get embedding vectors from llama.cpp server (batch)
 */
export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
	const response = await fetch(`${LLAMA_SERVER_URL}/embedding`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ input: texts })
	});

	if (!response.ok) {
		throw new Error(`Failed to get batch embeddings: ${response.statusText}`);
	}

	const data = await response.json();
	return data.map((item: any) => item.embedding[0]);
}

/**
 * Check if vector database exists for a book
 */
export async function hasVectorDB(repoName: string): Promise<boolean> {
	try {
		const milvusClient = new MilvusClient({ address: MILVUS_ADDRESS });
		const collectionName = `book_${repoName.replace(/[^a-zA-Z0-9]/g, '_')}`;
		const hasCollection = await milvusClient.hasCollection({ collection_name: collectionName });
		return !!hasCollection.value;
	} catch (error) {
		console.error(`Error checking vector database for ${repoName}:`, error);
		return false;
	}
}

/**
 * Search vector database for similar content
 */
export async function searchVectorDB(
	repoName: string,
	query: string,
	topK: number = 3
): Promise<Array<{ section_anchor: string; section_title: string; paragraph_text: string; score: number }>> {
	try {
		// Connect to Milvus
		const milvusClient = new MilvusClient({ address: MILVUS_ADDRESS });
		const collectionName = `book_${repoName.replace(/[^a-zA-Z0-9]/g, '_')}`;

		// Check if collection exists
		const hasCollection = await milvusClient.hasCollection({ collection_name: collectionName });
		if (!hasCollection.value) {
			console.error(`Collection ${collectionName} does not exist`);
			return [];
		}

		// Get embedding for query
		const queryEmbedding = await getEmbedding(query);

		// Search for similar vectors
		const searchResults = await milvusClient.search({
			collection_name: collectionName,
			vector: queryEmbedding,
			limit: topK,
			output_fields: ['section_anchor', 'section_title', 'paragraph_text']
		});

		// Format results
		const results = searchResults.results.map((result: any) => ({
			section_anchor: result.section_anchor,
			section_title: result.section_title,
			paragraph_text: result.paragraph_text,
			score: result.score
		}));

		return results;
	} catch (error) {
		console.error(`Error searching vector database for ${repoName}:`, error);
		return [];
	}
}
