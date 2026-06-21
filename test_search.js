const mysql = require('mysql2/promise');

async function debugSearch() {
    console.log("[!] Initiating Database Retrieval Debugger...");

    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'ub_guide_db'
    });

    try {
        const userMessage = "Tell me about BSc Programmes";
        console.log(`\n[1] Input Query: "${userMessage}"`);

        // Exact processing logic from server.js
        const lowerMessage = userMessage.toLowerCase();
        const searchTokens = lowerMessage
            .replace(/[^a-zA-Z\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 3); // Emulates the server filter

        console.log("[2] Processed Search Tokens:", searchTokens);

        if (searchTokens.length === 0) {
            console.log("[-] Warning: No valid search tokens extracted (all words under 4 characters)!");
            return;
        }

        // Rebuilding the active server query
        let queryConditions = searchTokens.map(() => `search_tokens LIKE ?`).join(' OR ');
        let queryParams = searchTokens.map(token => `%${token}%`);
        const sqlQuery = `SELECT id, section_heading, content_text, search_tokens FROM university_knowledge_base WHERE ${queryConditions} LIMIT 4`;

        console.log(`[3] Running SQL Query:\n    ${sqlQuery}`);
        console.log(`[4] Parameters passed:`, queryParams);

        const [rows] = await connection.execute(sqlQuery, queryParams);
        console.log(`\n[5] Database Results: Found ${rows.length} row(s).`);
        console.log("--------------------------------------------------");

        if (rows.length === 0) {
            console.log("[-] CRITICAL: The query returned 0 rows! Your server is passing an empty context string to the LLM.");
        } else {
            rows.forEach((row, i) => {
                console.log(`\n[Row ${i + 1}] ID: ${row.id} | Heading: ${row.section_heading}`);
                console.log(`Matched Tokens Row: [ ${row.search_tokens} ]`);
                console.log(`Snippet of content_text:\n"${row.content_text.substring(0, 150)}..."`);
                console.log("--------------------------------------------------");
            });
        }

    } catch (error) {
        console.error("[-] Diagnostic Error:", error.message);
    } finally {
        await connection.end();
        console.log("\n[!] Diagnostic run finished.");
    }
}

debugSearch();