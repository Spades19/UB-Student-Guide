const mysql = require('mysql2/promise');

async function deepCleanData() {
    console.log("[!] Initiating deep string-repair on content_text fields...");
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'ub_guide_db'
    });

    try {
        // 1. Fetch the rows
        const [rows] = await connection.execute("SELECT id, content_text FROM university_knowledge_base");
        let fixedCount = 0;

        for (const row of rows) {
            if (!row.content_text) continue;

            // Fix the common squished combinations manually in the text source
            let updatedText = row.content_text
                .replace(/academicsprogrammes/gi, 'academics programmes')
                .replace(/studyacademic/gi, 'study academic')
                .replace(/departmentscourses/gi, 'departments courses')
                .replace(/coursesexaminations/gi, 'courses examinations')
                .replace(/examinationsacademic/gi, 'examinations academic')
                .replace(/admissionsapply/gi, 'admissions apply')
                .replace(/ubadmission/gi, 'ub admission')
                .replace(/requirements/gi, 'requirements');

            // 2. Generate clean space-separated tokens from the repaired text
            const cleanTextForTokens = updatedText
                .toLowerCase()
                .replace(/[^a-zA-Z\s]/g, ' ')
                .replace(/[\n\r\t]/g, ' ');

            const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'to', 'in', 'for', 'of', 'you', 'your', 'with', 'from', 'this']);
            const words = cleanTextForTokens.split(/\s+/);
            const uniqueTokens = [...new Set(
                words.filter(word => word.length > 3 && !stopWords.has(word))
            )];

            const cleanTokensString = uniqueTokens.join(' ');

            // 3. Update both the source text and the tokens back into the row
            await connection.execute(
                "UPDATE university_knowledge_base SET content_text = ?, search_tokens = ? WHERE id = ?",
                [updatedText, cleanTokensString, row.id]
            );
            fixedCount++;
        }

        console.log(`[✓] Deep clean complete! Repaired data text formatting for all ${fixedCount} rows.`);

    } catch (error) {
        console.error("[-] Deep Clean Error:", error.message);
    } finally {
        await connection.end();
    }
}

deepCleanData();