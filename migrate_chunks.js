const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ub_guide_db' // Ensure this matches your active database name from server.js
};

function generateSearchTokens(text) {
    const cleanText = text.toLowerCase().replace(/[^a-zA-Z\s]/g, ' ');
    const words = cleanText.split(/\s+/);
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'to', 'in', 'for', 'of', 'you', 'your']);
    const uniqueTokens = [...new Set(words.filter(word => word.length > 2 && !stopWords.has(word)))];
    return uniqueTokens.join(' ');
}

async function migrateOldChunks() {
    console.log('[!] Starting old knowledge chunks migration pipeline...');

    const jsonPath = path.join(__dirname, 'knowledge_chunks.json');
    if (!fs.existsSync(jsonPath)) {
        console.error(`[-] Source file missing at ${jsonPath}. Nothing to migrate!`);
        return;
    }

    const chunks = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const connection = await mysql.createConnection(dbConfig);
    console.log('[✓] Connected to MySQL Server safely.');

    let migrateCount = 0;

    try {
        const insertQuery = `
            INSERT INTO university_knowledge_base 
            (category, source_url, section_heading, content_text, search_tokens) 
            VALUES (?, ?, ?, ?, ?)
        `;

        for (const chunk of chunks) {
            // Since these are old text chunks, we give them a generic category and placeholder URL
            const category = 'General Archive';
            const url = 'local://knowledge_chunks.json';

            // Try to extract a simple heading from the first few words, or give it a fallback label
            const sectionHeading = chunk.length < 50 ? chunk : chunk.substring(0, 45) + '...';
            const tokens = generateSearchTokens(chunk);

            await connection.execute(insertQuery, [category, url, sectionHeading, chunk, tokens]);
            migrateCount++;
        }

        console.log(`\n[✓] Migration complete! Successfully appended ${migrateCount} historical chunks to your MySQL database.`);

    } catch (error) {
        console.error(`[-] Migration Error: ${error.message}`);
    } finally {
        await connection.end();
        console.log('[!] Database connection closed cleanly.');
    }
}

migrateOldChunks();