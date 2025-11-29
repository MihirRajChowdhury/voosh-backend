const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { initRedis, getClient } = require('./redisClient');
const { ingestNews } = require('./ingest');
const { generateEmbeddings } = require('./embeddings');
const { initVectorStore, addDocuments, search } = require('./vectorStore');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Gemini for Chat
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: {
    parts: [{ text: `You are a helpful news assistant. Answer based ONLY on context. Do NOT start your answer with "Based on the context provided" or similar phrases. Just answer the question directly.` }],
    role: "model"
  }
});

// Initialize System
const initializeSystem = async () => {
  await initRedis();
  await initVectorStore();

  // Ingest and Index News on Startup
  try {
    const articles = await ingestNews();
    console.log(`Ingested ${articles.length} articles. Generating embeddings...`);

    // Process sequentially to avoid rate limits
    for (const article of articles) {
      const textToEmbed = `${article.title}. ${article.content}`;
      const embedding = await generateEmbeddings(textToEmbed);
      if (embedding) {
        await addDocuments([{
          id: uuidv4(),
          text: textToEmbed,
          embedding: embedding,
          metadata: article
        }]);
      }
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log('System initialization complete.');
  } catch (error) {
    console.error('Initialization failed:', error);
  }
};

initializeSystem();

// --- Routes ---

// Create a new session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  console.log('Received message:', message);

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  try {
    // 1. Retrieve Context
    const queryEmbedding = await generateEmbeddings(message);
    let context = "";
    let sources = [];

    if (queryEmbedding) {
      const results = await search(queryEmbedding, 3);
      context = results.map(r => r.text).join("\n\n");
      sources = results.map(r => r.metadata);
    }

    console.log('Query Embedding:', queryEmbedding);

    // 2. Get Chat History
    const redisClient = getClient();
    let history = [];
    if (redisClient) {
      const historyStr = await redisClient.get(`session:${sessionId}`);
      if (historyStr) {
        history = JSON.parse(historyStr);
      }
    }

    // 3. Construct Prompt with History and Context
    const chat = chatModel.startChat({
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      })),
    });

    const finalPrompt = `Context:\n${context}\n\nQuestion: ${message}`;

    const result = await chat.sendMessage(finalPrompt);
    const response = result.response.text();

    // 4. Update History
    const newHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    ];

    if (redisClient) {
      await redisClient.set(`session:${sessionId}`, JSON.stringify(newHistory), {
        EX: 3600 // 1 hour TTL
      });
    }
    console.log('Response:', response);

    res.json({ answer: response, sources });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Session History
app.get('/api/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const redisClient = getClient();

  if (!redisClient) {
    return res.json({ history: [] }); // Fallback
  }

  const historyStr = await redisClient.get(`session:${sessionId}`);
  res.json({ history: historyStr ? JSON.parse(historyStr) : [] });
});

// Clear Session
app.delete('/api/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const redisClient = getClient();

  if (redisClient) {
    await redisClient.del(`session:${sessionId}`);
  }

  res.json({ message: 'Session cleared' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
