const mysql = require("mysql2/promise");
require("dotenv").config();

async function makeAdmin() {
    const email = process.argv[2];

    if (!email) {
        console.error("Usage: node make_admin.js your-email@example.com");
        process.exit(1);
    }

    const db = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "ub_guide_db"
    });

    try {
        await db.execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'")
            .catch((error) => {
                if (error.code !== "ER_DUP_FIELDNAME") throw error;
            });

        const [result] = await db.execute(
            "UPDATE users SET role = 'admin' WHERE email = ?",
            [email]
        );

        if (result.affectedRows === 0) {
            console.log(`No user found with email: ${email}`);
        } else {
            console.log(`Admin access granted to: ${email}`);
        }
    } finally {
        await db.end();
    }
}

makeAdmin().catch((error) => {
    console.error("Could not update admin role:", error.message);
    process.exit(1);
});
