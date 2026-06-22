const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 1. Configure your local University of Buea Backend Database Credentials
const dbConfig = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'ub_guide_db',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306)
};

// 2. Helper function to tokenize text (mimicking your server-side parser logic)
function generateSearchTokens(text, heading) {
    // Combine heading and text to maximize keyword discovery
    const combined = `${heading} ${text}`.toLowerCase();

    // Remove punctuation, special characters, and numbers
    const cleanText = combined.replace(/[^a-zA-Z\s]/g, ' ');

    // Split into distinct words
    const words = cleanText.split(/\s+/);

    // Common conversational filler text/stopwords to strip out for optimization
    const stopWords = new Set([
        'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'to', 'in', 'for',
        'of', 'you', 'your', 'we', 'our', 'this', 'that', 'from', 'with', 'by'
    ]);

    // Filter out filler words and short fragments, then isolate unique tokens
    const uniqueTokens = [...new Set(words.filter(word => word.length > 2 && !stopWords.has(word)))];

    return uniqueTokens.join(' ');
}

async function injectKnowledgeBase() {
    console.log('[!] Starting database injection pipeline...');

    // Check if the scraper output file exists before proceeding
    const jsonPath = path.join(__dirname, 'ub_knowledge_base.json');
    if (!fs.existsSync(jsonPath)) {
        console.error(`[-] Source file missing at ${jsonPath}. Run scraper.js first!`);
        return;
    }

    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const knowledgeData = JSON.parse(rawData);

    // Connect to the localized MySQL database
    const connection = await mysql.createConnection(dbConfig);
    console.log('[✓] Connected to MySQL Server safely.');

    let recordCount = 0;

    try {
        // Clear previous records to avoid duplicate handbook entries during testing
        console.log('[!] Clearing old records from university_knowledge_base...');
        await connection.execute('TRUNCATE TABLE university_knowledge_base');

        const insertQuery = `
            INSERT INTO university_knowledge_base 
            (category, source_url, section_heading, content_text, search_tokens) 
            VALUES (?, ?, ?, ?, ?)
        `;

        // Loop through each scraped resource page
        for (const page of knowledgeData) {
            console.log(`[!] Processing segments for page: "${page.title}"`);

            // Loop through each distinct text block inside that page
            for (const item of page.content) {
                const category = page.category;
                const url = page.url;
                const heading = item.heading || 'General Rule';
                const text = item.text;

                // Generate search tokens for this block
                const tokens = generateSearchTokens(text, heading);

                // Run insertion query
                await connection.execute(insertQuery, [category, url, heading, text, tokens]);
                recordCount++;
            }
        }

        console.log(`\n[✓] Injection complete! Successfully processed and stored ${recordCount} segments.`);

    } catch (error) {
        console.error(`[-] Runtime Database Error: ${error.message}`);
    } finally {
        await connection.end();
        console.log('[!] Database connection closed cleanly.');
    }
}

injectKnowledgeBase();
