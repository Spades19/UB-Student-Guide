const mysql = require('mysql2/promise');

async function checkDatabase() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'ub_guide_db'
    });

    try {
        // Let's print out 5 random headings and their search tokens to see what's in there
        const [rows] = await connection.execute(
            "SELECT section_heading, search_tokens FROM university_knowledge_base LIMIT 5"
        );

        console.log("[!] Here is a sample of what keywords your database is expecting:\n");
        rows.forEach((row, i) => {
            console.log(`${i + 1}. Heading: ${row.section_heading}`);
            console.log(`   Tokens:  [ ${row.search_tokens} ]\n`);
        });

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await connection.end();
    }
}

checkDatabase();