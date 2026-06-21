const fs = require('fs');
const path = require('path');
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mysql = require("mysql2/promise"); // Added for SQL database interaction
const bcrypt = require("bcryptjs");      // Added for secure password hashing
const jwt = require("jsonwebtoken");     // Added for student session authentication
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// MYSQL DATABASE CONNECTION POOL
// ==========================================
const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "ub_guide_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verify database connectivity on startup
db.getConnection()
    .then(() => console.log("Connected to MySQL Database successfully"))
    .catch((err) => console.error("MySQL Connection Error:", err));

async function addColumnIfMissing(tableName, columnDefinition) {
    try {
        await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
    } catch (error) {
        if (error.code !== "ER_DUP_FIELDNAME") {
            console.warn(`Column setup warning for ${tableName}:`, error.message);
        }
    }
}

async function addIndexIfMissing(tableName, indexDefinition) {
    try {
        await db.execute(`ALTER TABLE ${tableName} ADD INDEX ${indexDefinition}`);
    } catch (error) {
        if (error.code !== "ER_DUP_KEYNAME") {
            console.warn(`Index setup warning for ${tableName}:`, error.message);
        }
    }
}

async function ensureDatabaseTables() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                sender VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(160) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (user_id)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS feedback (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message_id INT NOT NULL,
                rating ENUM('helpful', 'not_helpful') NOT NULL,
                feedback_comment TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (message_id)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS unanswered_questions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                session_id INT NULL,
                question TEXT NOT NULL,
                status ENUM('open', 'reviewed', 'resolved') DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (status)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (expires_at)
            )
        `);

        await addColumnIfMissing("messages", "session_id INT NULL");
        await addColumnIfMissing("messages", "sources_json TEXT NULL");
        await addIndexIfMissing("messages", "idx_messages_session_id (session_id)");
        await addColumnIfMissing("feedback", "feedback_comment TEXT NULL");
        await addColumnIfMissing("users", "role VARCHAR(20) NOT NULL DEFAULT 'student'");

        console.log("Database feature tables are ready");
    } catch (error) {
        console.error("Database setup error:", error.message);
    }
}

ensureDatabaseTables();

const STOP_WORDS = new Set([
    "about", "after", "also", "and", "are", "can", "could", "does", "for", "from",
    "have", "how", "into", "please", "should", "tell", "that", "the", "their",
    "there", "this", "what", "when", "where", "which", "with", "would", "your"
]);

const QUERY_SYNONYMS = {
    bsc: ["bsc", "bachelor", "science", "undergraduate", "programme", "programmes", "program"],
    bachelor: ["bachelor", "bsc", "undergraduate", "degree"],
    bachelors: ["bachelor", "bsc", "undergraduate", "degree"],
    programme: ["programme", "program", "programmes", "course", "courses"],
    programmes: ["programme", "program", "programmes", "course", "courses"],
    program: ["programme", "program", "programmes", "course", "courses"],
    programs: ["programme", "program", "programmes", "course", "courses"],
    fee: ["fee", "fees", "tuition", "payment"],
    fees: ["fee", "fees", "tuition", "payment"],
    admission: ["admission", "admissions", "apply", "application"],
    admissions: ["admission", "admissions", "apply", "application"],
    exam: ["exam", "exams", "examination", "examinations"],
    exams: ["exam", "exams", "examination", "examinations"]
};

function extractSearchTokens(message) {
    const rawTokens = message
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    const expandedTokens = [];

    rawTokens.forEach((token) => {
        if ((token.length >= 3 || token === "ub") && !STOP_WORDS.has(token)) {
            expandedTokens.push(token);
        }

        if (QUERY_SYNONYMS[token]) {
            expandedTokens.push(...QUERY_SYNONYMS[token]);
        }
    });

    return [...new Set(expandedTokens)].slice(0, 12);
}

async function findRelevantKnowledge(searchTokens) {
    if (searchTokens.length === 0) {
        return [];
    }

    const scoreParts = [];
    const whereParts = [];
    const scoreParams = [];
    const whereParams = [];

    searchTokens.forEach((token) => {
        const tokenPattern = `% ${token} %`;
        const likePattern = `%${token}%`;

        scoreParts.push(`
            (CASE WHEN LOWER(COALESCE(section_heading, '')) LIKE ? THEN 8 ELSE 0 END) +
            (CASE WHEN LOWER(CONCAT(' ', COALESCE(search_tokens, ''), ' ')) LIKE ? THEN 5 ELSE 0 END) +
            (CASE WHEN LOWER(COALESCE(content_text, '')) LIKE ? THEN 2 ELSE 0 END)
        `);
        scoreParams.push(likePattern, tokenPattern, likePattern);

        whereParts.push("(LOWER(COALESCE(section_heading, '')) LIKE ? OR LOWER(CONCAT(' ', COALESCE(search_tokens, ''), ' ')) LIKE ? OR LOWER(COALESCE(content_text, '')) LIKE ?)");
        whereParams.push(likePattern, tokenPattern, likePattern);
    });

    const sqlQuery = `
        SELECT id, category, source_url, section_heading, content_text, (${scoreParts.join(" + ")}) AS relevance_score
        FROM university_knowledge_base
        WHERE ${whereParts.join(" OR ")}
        ORDER BY relevance_score DESC
        LIMIT 6
    `;

    const params = [...scoreParams, ...whereParams];
    const [rows] = await db.execute(sqlQuery, params);
    return rows;
}

function buildSessionTitle(message) {
    const cleanTitle = message.replace(/\s+/g, " ").trim();
    if (!cleanTitle) return "New conversation";
    return cleanTitle.length > 70 ? cleanTitle.substring(0, 67) + "..." : cleanTitle;
}

function buildCitations(rows) {
    return rows.slice(0, 3).map((row) => ({
        id: row.id,
        heading: row.section_heading || "University knowledge base",
        category: row.category || "General",
        sourceUrl: row.source_url || "",
        score: row.relevance_score || 0
    }));
}

async function getOrCreateSession(userId, sessionId, firstMessage) {
    if (sessionId) {
        const [existingSessions] = await db.execute(
            "SELECT id, title FROM chat_sessions WHERE id = ? AND user_id = ?",
            [sessionId, userId]
        );

        if (existingSessions.length > 0) {
            return existingSessions[0];
        }
    }

    const title = buildSessionTitle(firstMessage);
    const [result] = await db.execute(
        "INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)",
        [userId, title]
    );

    return { id: result.insertId, title };
}

function shouldLogUnanswered(reply, hasContext) {
    return !hasContext || reply.toLowerCase().includes("i don't have the official university handbook details");
}

async function requireAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

        if (!token) {
            return res.status(401).json({ error: "Admin login required." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "ub_secret_key_123");
        const [users] = await db.execute("SELECT id, role FROM users WHERE id = ?", [decoded.userId]);

        if (users.length === 0 || users[0].role !== "admin") {
            return res.status(403).json({ error: "Admin access only." });
        }

        req.adminUser = users[0];
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid or expired admin session." });
    }
}

app.get("/", (req, res) => {
    res.send("Backend working");
});

// ==========================================
// AUTHENTICATION ROUTES (SQL)
// ==========================================

// 1. User Registration
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const [existingUsers] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.execute(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword]
        );

        res.status(201).json({ message: "Registration successful! Please login." });

    } catch (error) {
        console.error("SQL Registration Error:", error);
        res.status(500).json({ error: "Server error during registration" });
    }
});

// 2. User Login
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
        if (users.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user.id, name: user.name },
            process.env.JWT_SECRET || "ub_secret_key_123",
            { expiresIn: "24h" }
        );

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id, // <-- Make sure this is user.id (matching your database column name)
                name: user.name,
                email: user.email,
                role: user.role || "student"
            }
        });

    } catch (error) {
        console.error("SQL Login Error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});

app.post("/request-password-reset", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const [users] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
        if (users.length === 0) {
            return res.json({ message: "If the email exists, a reset code has been generated." });
        }

        const resetCode = crypto.randomInt(100000, 999999).toString();
        const salt = await bcrypt.genSalt(10);
        const tokenHash = await bcrypt.hash(resetCode, salt);

        await db.execute(
            "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
            [users[0].id]
        );
        await db.execute(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))",
            [users[0].id, tokenHash]
        );

        console.log(`[PASSWORD RESET CODE] ${email}: ${resetCode} (expires in 15 minutes)`);

        res.json({ message: "A reset code has been generated. For this local demo, check the server console." });
    } catch (error) {
        console.error("Password Reset Request Error:", error);
        res.status(500).json({ error: "Server error during password reset request" });
    }
});

app.post("/reset-password", async (req, res) => {
    try {
        const { email, resetCode, newPassword } = req.body;

        if (!email || !resetCode || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: "Email, reset code, and a new password of at least 6 characters are required" });
        }

        const [users] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
        if (users.length === 0) {
            return res.status(400).json({ error: "Invalid or expired reset code" });
        }

        const [tokens] = await db.execute(
            `SELECT id, token_hash
             FROM password_reset_tokens
             WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [users[0].id]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ error: "Invalid or expired reset code" });
        }

        const codeMatches = await bcrypt.compare(resetCode, tokens[0].token_hash);
        if (!codeMatches) {
            return res.status(400).json({ error: "Invalid or expired reset code" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.execute("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, users[0].id]);
        await db.execute("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [tokens[0].id]);

        res.json({ message: "Password reset successful. You can now log in with your new password." });
    } catch (error) {
        console.error("Password Reset Error:", error);
        res.status(500).json({ error: "Server error during password reset" });
    }
});

// =======================================================
// FETCH HISTORICAL CHAT LOGS
// =======================================================
app.get("/api/chat/history", async (req, res) => {
    // Force convert the string header into a standard Integer number
    const userId = parseInt(req.headers['user-id'], 10);
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId, 10) : null;

    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: "Unauthorized session access query." });
    }

    try {
        if (sessionId) {
            const [history] = await db.execute(
                "SELECT id, session_id, sender, message, sources_json, created_at FROM messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC",
                [userId, sessionId]
            );
            return res.json({ history });
        }

        const [history] = await db.execute(
            "SELECT id, session_id, sender, message, sources_json, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC",
            [userId]
        );
        res.json({ history });
    } catch (error) {
        console.error("History Fetch Error:", error);
        res.status(500).json({ error: "Failed to load prior chat histories." });
    }
});

app.get("/api/chat/sessions", async (req, res) => {
    const userId = parseInt(req.headers['user-id'], 10);

    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: "Unauthorized session access query." });
    }

    try {
        const [sessions] = await db.execute(
            `SELECT cs.id, cs.title, cs.created_at, cs.updated_at, COUNT(m.id) AS message_count
             FROM chat_sessions cs
             LEFT JOIN messages m ON m.session_id = cs.id
             WHERE cs.user_id = ?
             GROUP BY cs.id
             ORDER BY cs.updated_at DESC
             LIMIT 20`,
            [userId]
        );

        res.json({ sessions });
    } catch (error) {
        console.error("Session Fetch Error:", error);
        res.status(500).json({ error: "Failed to load conversation sessions." });
    }
});

app.post("/api/chat/sessions", async (req, res) => {
    const userId = parseInt(req.headers['user-id'], 10);
    const title = buildSessionTitle(req.body.title || "New conversation");

    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: "Unauthorized session access query." });
    }

    try {
        const [result] = await db.execute(
            "INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)",
            [userId, title]
        );

        res.status(201).json({ session: { id: result.insertId, title } });
    } catch (error) {
        console.error("Session Create Error:", error);
        res.status(500).json({ error: "Failed to create conversation session." });
    }
});

app.post("/api/feedback", async (req, res) => {
    const userId = parseInt(req.headers['user-id'], 10);
    const messageId = parseInt(req.body.messageId, 10);
    const rating = req.body.rating;
    const comment = req.body.comment || null;

    if (!userId || isNaN(userId) || !messageId || !["helpful", "not_helpful"].includes(rating)) {
        return res.status(400).json({ error: "Invalid feedback request." });
    }

    try {
        await db.execute(
            "INSERT INTO feedback (user_id, message_id, rating, feedback_comment) VALUES (?, ?, ?, ?)",
            [userId, messageId, rating, comment]
        );

        res.status(201).json({ message: "Feedback saved. Thank you." });
    } catch (error) {
        console.error("Feedback Save Error:", error);
        res.status(500).json({ error: "Failed to save feedback." });
    }
});

app.get("/api/admin/knowledge", requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, category, source_url, section_heading, content_text, search_tokens
             FROM university_knowledge_base
             ORDER BY id DESC
             LIMIT 100`
        );
        res.json({ knowledge: rows });
    } catch (error) {
        console.error("Knowledge Admin Fetch Error:", error);
        res.status(500).json({ error: "Failed to load knowledge records." });
    }
});

app.post("/api/admin/knowledge", requireAdmin, async (req, res) => {
    const { category, source_url, section_heading, content_text } = req.body;
    const tokens = extractSearchTokens(`${section_heading || ""} ${content_text || ""}`).join(" ");

    if (!section_heading || !content_text) {
        return res.status(400).json({ error: "Heading and content are required." });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO university_knowledge_base
             (category, source_url, section_heading, content_text, search_tokens)
             VALUES (?, ?, ?, ?, ?)`,
            [category || "Admin Entry", source_url || "admin://manual-entry", section_heading, content_text, tokens]
        );

        res.status(201).json({ id: result.insertId, message: "Knowledge entry added." });
    } catch (error) {
        console.error("Knowledge Admin Create Error:", error);
        res.status(500).json({ error: "Failed to add knowledge entry." });
    }
});

app.put("/api/admin/knowledge/:id", requireAdmin, async (req, res) => {
    const knowledgeId = parseInt(req.params.id, 10);
    const { category, source_url, section_heading, content_text } = req.body;
    const tokens = extractSearchTokens(`${section_heading || ""} ${content_text || ""}`).join(" ");

    if (!knowledgeId || !section_heading || !content_text) {
        return res.status(400).json({ error: "Valid ID, heading, and content are required." });
    }

    try {
        await db.execute(
            `UPDATE university_knowledge_base
             SET category = ?, source_url = ?, section_heading = ?, content_text = ?, search_tokens = ?
             WHERE id = ?`,
            [category || "Admin Entry", source_url || "admin://manual-entry", section_heading, content_text, tokens, knowledgeId]
        );

        res.json({ message: "Knowledge entry updated." });
    } catch (error) {
        console.error("Knowledge Admin Update Error:", error);
        res.status(500).json({ error: "Failed to update knowledge entry." });
    }
});

app.delete("/api/admin/knowledge/:id", requireAdmin, async (req, res) => {
    const knowledgeId = parseInt(req.params.id, 10);

    if (!knowledgeId) {
        return res.status(400).json({ error: "Valid knowledge ID is required." });
    }

    try {
        await db.execute("DELETE FROM university_knowledge_base WHERE id = ?", [knowledgeId]);
        res.json({ message: "Knowledge entry deleted." });
    } catch (error) {
        console.error("Knowledge Admin Delete Error:", error);
        res.status(500).json({ error: "Failed to delete knowledge entry." });
    }
});

app.get("/api/admin/unanswered", requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT uq.id, uq.question, uq.status, uq.created_at, u.name AS student_name
             FROM unanswered_questions uq
             LEFT JOIN users u ON u.id = uq.user_id
             ORDER BY uq.created_at DESC
             LIMIT 100`
        );
        res.json({ unanswered: rows });
    } catch (error) {
        console.error("Unanswered Fetch Error:", error);
        res.status(500).json({ error: "Failed to load unanswered questions." });
    }
});

app.put("/api/admin/unanswered/:id", requireAdmin, async (req, res) => {
    const questionId = parseInt(req.params.id, 10);
    const status = req.body.status;

    if (!questionId || !["open", "reviewed", "resolved"].includes(status)) {
        return res.status(400).json({ error: "Valid question ID and status are required." });
    }

    try {
        await db.execute("UPDATE unanswered_questions SET status = ? WHERE id = ?", [status, questionId]);
        res.json({ message: "Question status updated." });
    } catch (error) {
        console.error("Unanswered Update Error:", error);
        res.status(500).json({ error: "Failed to update question status." });
    }
});

app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
        const [[userStats]] = await db.execute("SELECT COUNT(*) AS total_users FROM users");
        const [[messageStats]] = await db.execute("SELECT COUNT(*) AS total_messages FROM messages");
        const [[sessionStats]] = await db.execute("SELECT COUNT(*) AS total_sessions FROM chat_sessions");
        const [[unansweredStats]] = await db.execute("SELECT COUNT(*) AS open_unanswered FROM unanswered_questions WHERE status = 'open'");
        const [[helpfulStats]] = await db.execute("SELECT COUNT(*) AS helpful_count FROM feedback WHERE rating = 'helpful'");
        const [[notHelpfulStats]] = await db.execute("SELECT COUNT(*) AS not_helpful_count FROM feedback WHERE rating = 'not_helpful'");
        const [recentQuestions] = await db.execute(
            `SELECT message, created_at
             FROM messages
             WHERE sender = 'user'
             ORDER BY created_at DESC
             LIMIT 8`
        );

        res.json({
            totals: {
                users: userStats.total_users,
                messages: messageStats.total_messages,
                sessions: sessionStats.total_sessions,
                openUnanswered: unansweredStats.open_unanswered,
                helpful: helpfulStats.helpful_count,
                notHelpful: notHelpfulStats.not_helpful_count
            },
            recentQuestions
        });
    } catch (error) {
        console.error("Analytics Error:", error);
        res.status(500).json({ error: "Failed to load analytics." });
    }
});

// =======================================================
// PERSISTENT RAG CHAT ENDPOINT (MERGED & CLEANED)
// =======================================================
app.post("/chat", async (req, res) => {
    const userMessage = req.body.message || "";
    const requestedSessionId = req.body.sessionId ? parseInt(req.body.sessionId, 10) : null;
    const userId = parseInt(req.headers['user-id'], 10);

    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: "Session missing user identity header ('user-id')." });
    }

    try {
        const session = await getOrCreateSession(userId, requestedSessionId, userMessage);

        // 1. Save User Message immediately to SQL (Passing clean integer ID)
        await db.execute(
            "INSERT INTO messages (user_id, session_id, sender, message) VALUES (?, ?, 'user', ?)",
            [userId, session.id, userMessage]
        );

        let relevantContext = "";

        const searchTokens = extractSearchTokens(userMessage);
        console.log("[DEBUG] Extracted Search Tokens:", searchTokens);

        const rows = await findRelevantKnowledge(searchTokens);
        console.log(`[DEBUG] Knowledge lookup found ${rows.length} matching rows.`);
        const sources = buildCitations(rows);

        rows.forEach(row => {
            relevantContext += `[Source: ${row.category || "General"} > ${row.section_heading}]\n${row.content_text}\n\n`;
        });

        // 3. FALLBACK DECK: Check for text file chunks if MySQL returns nothing
        if (!relevantContext.trim()) {
            const jsonPath = path.join(__dirname, 'knowledge_chunks.json');
            if (fs.existsSync(jsonPath)) {
                const chunks = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                let scoredChunks = chunks.map(chunk => {
                    let score = 0;
                    const lowerChunk = chunk.toLowerCase();
                    searchTokens.forEach(token => {
                        if (lowerChunk.includes(token)) score += 2;
                    });
                    return { chunk, score };
                });

                scoredChunks.sort((a, b) => b.score - a.score);
                const topMatches = scoredChunks.filter(item => item.score > 0).slice(0, 2);
                topMatches.forEach(item => { relevantContext += item.chunk + "\n\n"; });
            }
        }

        const hasContext = relevantContext.trim().length > 0;

        // 4. Complete Prompt Matrix Setup
        const prompt = `
        You are UB Guide AI, an authentic, supportive, and knowledgeable campus assistant for students at the University of Buea (UB). 
        You speak like an encouraging, helpful peer—grounded, smart, and approachable, not like a rigid corporate machine.

        DETERMINE YOUR LANE BASED ON THE STUDENT'S INQUIRY:

        LANE 1: OFFICIAL ACADEMIC RULES & PROCEDURES
        If the student is asking about official UB policies, metrics, fees, grading systems, or formal deadlines:
        - Look at the "OFFICIAL HANDBOOK CONTEXT" section below.
        - Base your answer strictly on that verified data. 
        - If the context section does not contain the information to answer an official rule question, say exactly: "I don't have the official university handbook details regarding that specific request yet. Please check with your department coordinator or the IT Centre." Never guess or invent numbers, banking details, or specific dates.

        LANE 2: GREETINGS & GENERAL STUDENT LIFE ADVICE
        If the student is just saying hi, checking in, or asking for general advice (e.g., study tips, dealing with exam stress, navigating campus life, time management):
        - Relax the strict rules. You do NOT need handbook context for this.
        - Answer naturally using your built-in intelligence. 
        - Be encouraging, offer practical peer-to-peer advice, and keep the tone warm.

        OFFICIAL HANDBOOK CONTEXT:
        ${relevantContext ? relevantContext.trim() : "No handbook data matches this query."}

        IMPORTANT SOURCE RULE:
        If handbook context is available, answer from it and do not invent details outside it. The application will show the source headings separately, so keep your answer clean and student-friendly.

        STUDENT INQUIRY:
        "${userMessage}"

        UB GUIDE RESPONSE:
        `;

        // 5. Fire prompt to Gemini API
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] }
        );

        const botReply = response.data.candidates[0].content.parts[0].text;

        // 6. Save Bot Response directly to SQL
        const [botInsert] = await db.execute(
            "INSERT INTO messages (user_id, session_id, sender, message, sources_json) VALUES (?, ?, 'bot', ?, ?)",
            [userId, session.id, botReply, JSON.stringify(sources)]
        );

        await db.execute("UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [session.id]);

        if (shouldLogUnanswered(botReply, hasContext)) {
            await db.execute(
                "INSERT INTO unanswered_questions (user_id, session_id, question) VALUES (?, ?, ?)",
                [userId, session.id, userMessage]
            );
        }

        res.json({
            reply: botReply,
            sessionId: session.id,
            messageId: botInsert.insertId,
            sources
        });

    } catch (error) {
        console.error("Generation / Save Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Something went wrong processing your campus guide request." });
    }
});
app.listen(5000, () => {
    console.log("Server running on port 5000");
});
