const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

const generateEmbeddings = async (text) => {
    try {
        const result = await model.embedContent(text);
        const embedding = result.embedding;
        return embedding.values;
    } catch (error) {
        console.error("Error generating embedding:", error);
        return null;
    }
};

const generateBatchEmbeddings = async (texts) => {
    // Gemini has rate limits, so we might need to process in chunks or sequentially if batching isn't directly supported/reliable on free tier
    // For simplicity and safety on free tier, let's do sequential or small Promise.all
    const embeddings = [];
    for (const text of texts) {
        const emb = await generateEmbeddings(text);
        if (emb) embeddings.push(emb);
        // Small delay to avoid hitting rate limits too hard
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return embeddings;
};

module.exports = { generateEmbeddings, generateBatchEmbeddings };
