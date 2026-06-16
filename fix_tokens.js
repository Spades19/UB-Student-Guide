const mysql = require('mysql2/promise');

async function fixTokens() {
    console.log("[!] Connecting to database to repair squished tokens...");
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'ub_guide_db'
    });

    try {
        // 1. Fetch all rows that need fixing
        const [rows] = await connection.execute("SELECT id, content_text FROM university_knowledge_base");
        console.log(`[✓] Found ${rows.length} rows to optimize.`);

        const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'to', 'in', 'for', 'of', 'you', 'your', 'with', 'from', 'this']);
        let updateCount = 0;

        // 2. Loop through every row and re-generate clean tokens straight from the core content_text
        for (const row of rows) {
            if (!row.content_text) continue;

            // Clean the core text: turn newlines, tabs, and special chars into clean spaces
            const cleanText = row.content_text
                .toLowerCase()
                .replace(/[^a-zA-Z\s]/g, ' ') // Replace punctuation with spaces
                .replace(/[\n\r\t]/g, ' ');   // Replace line breaks and tabs with spaces

            // Split by any whitespace sequence
            const words = cleanText.split(/\s+/);

            // Filter down to unique, valid standalone keywords
            const uniqueTokens = [...new Set(
                words.filter(word => word.length > 3 && !stopWords.has(word))
            )];

            const repairedTokensString = uniqueTokens.join(' ');

            // 3. Push the clean token string back to MySQL
            await connection.execute(
                "UPDATE university_knowledge_base SET search_tokens = ? WHERE id = ?",
                [repairedTokensString, row.id]
            );
            updateCount++;
        }

        console.log(`[✓] Successfully rebuilt and isolated keywords for all ${updateCount} records!`);

    } catch (error) {
        console.error("[-] Repair Error:", error.message);
    } finally {
        await connection.end();
        console.log("[!] Database connection closed cleanly.");
    }
}

fixTokens();