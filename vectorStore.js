const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs');

let db = null;
let table = null;

const DB_DIR = path.join(__dirname, '/tmp/lancedb');



const initVectorStore = async () => {
    try {
        // Ensure directory exists (LanceDB might create it, but good to be safe)
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        db = await lancedb.connect(DB_DIR);

        // Check if table exists, if not create it with a dummy schema or wait for first add
        const tableNames = await db.tableNames();
        if (tableNames.includes('news_articles')) {
            table = await db.openTable('news_articles');
            console.log('Opened existing LanceDB table: news_articles');
        } else {
            console.log('LanceDB table news_articles does not exist yet. It will be created on first ingestion.');
        }
    } catch (error) {
        console.error('Failed to initialize LanceDB:', error);
    }
};

const addDocuments = async (documents) => {
    // documents: array of { id, text, embedding, metadata }
    if (!db) await initVectorStore();

    if (documents.length === 0) return;

    // Format for LanceDB: needs 'vector' field for embedding
    const data = documents.map(doc => ({
        id: doc.id,
        text: doc.text,
        vector: doc.embedding,
        ...doc.metadata // Flatten metadata into columns
    }));

    try {
        if (!table) {
            // Create table with the first batch of data
            table = await db.createTable('news_articles', data);
            console.log(`Created LanceDB table with ${data.length} documents.`);
        } else {
            await table.add(data);
            console.log(`Added ${data.length} documents to LanceDB.`);
        }
    } catch (error) {
        console.error('Error adding documents to LanceDB:', error);
    }
};

const search = async (queryEmbedding, topK = 3) => {
    if (!table) {
        console.warn('Vector store is empty or not initialized.');
        return [];
    }

    try {
        const results = await table.search(queryEmbedding)
            .limit(topK)
            .execute();

        // Map back to our application's expected format
        return results.map(r => ({
            id: r.id,
            text: r.text,
            score: r._distance ? (1 - r._distance) : 0, // LanceDB returns distance (lower is better), we want similarity (higher is better) roughly
            metadata: {
                title: r.title,
                link: r.link,
                pubDate: r.pubDate,
                source: r.source
            }
        }));
    } catch (error) {
        console.error('Error searching LanceDB:', error);
        return [];
    }
};

const clearStore = async () => {
    // Not easily supported in simple mode without dropping table, 
    // but for this assignment we might just want to overwrite or ignore.
    // For now, do nothing or drop table if needed.
    if (table && db) {
        try {
            await db.dropTable('news_articles');
            table = null;
            console.log('Dropped LanceDB table.');
        } catch (e) {
            console.error('Error clearing store:', e);
        }
    }
};

module.exports = { initVectorStore, addDocuments, search, clearStore };
