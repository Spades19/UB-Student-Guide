const fs = require('fs');
const path = require('path');
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mysql = require("mysql2/promise"); // Added for SQL database interaction
const bcrypt = require("bcryptjs");      // Added for secure password hashing
const jwt = require("jsonwebtoken");     // Added for student session authentication
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
                email: user.email
            }
        });

    } catch (error) {
        console.error("SQL Login Error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});

// =======================================================
// FETCH HISTORICAL CHAT LOGS
// =======================================================
app.get("/api/chat/history", async (req, res) => {
    // Force convert the string header into a standard Integer number
    const userId = parseInt(req.headers['user-id'], 10);

    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: "Unauthorized session access query." });
    }

    try {
        const [history] = await db.execute(
            "SELECT sender, message, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC",
            [userId]
        );
        res.json({ history });
    } catch (error) {
        console.error("History Fetch Error:", error);
        res.status(500).json({ error: "Failed to load prior chat histories." });
    }
});

// =======================================================
// PERSISTENT RAG CHAT ENDPOINT (MERGED & CLEANED)
// =======================================================
app.post("/chat", async (req, res) => {
    const userMessage = req.body.message || "";
    // Force convert the string header into a standard Integer number here too!
    const userId = parseInt(req.headers['user-id'], 10);
    const lowerMessage = userMessage.toLowerCase();

    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: "Session missing user identity header ('user-id')." });
    }

    try {
        // 1. Save User Message immediately to SQL (Now passing a clean integer ID)
        await db.execute(
            "INSERT INTO messages (user_id, sender, message) VALUES (?, 'user', ?)",
            [userId, userMessage]
        );

        let relevantContext = "";
        const jsonPath = path.join(__dirname, 'knowledge_chunks.json');

        // 2. Token Matching Engine for PDF Context Chunks
        if (fs.existsSync(jsonPath)) {
            const chunks = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const queryTokens = lowerMessage.split(/\s+/)
                .filter(word => word.length > 3)
                .map(word => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""));

            let scoredChunks = chunks.map(chunk => {
                let score = 0;
                const lowerChunk = chunk.toLowerCase();
                queryTokens.forEach(token => {
                    if (lowerChunk.includes(token)) score += 2;
                });
                return { chunk, score };
            });

            scoredChunks.sort((a, b) => b.score - a.score);
            const topMatches = scoredChunks.filter(item => item.score > 0).slice(0, 3);
            topMatches.forEach(item => { relevantContext += item.chunk + "\n\n"; });
        } else {
            console.warn("⚠️ Warning: knowledge_chunks.json missing!");
        }

        // 3. Complete Prompt Matrix Setup
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
        ${relevantContext ? relevantContext : ""}

        STUDIN INQUIRY:
        "${userMessage}"

        UB GUIDE RESPONSE:
        `;

        // 4. Fire prompt to Gemini API
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] }
        );

        const botReply = response.data.candidates[0].content.parts[0].text;

        // 5. Save Bot Response directly to SQL
        await db.execute(
            "INSERT INTO messages (user_id, sender, message) VALUES (?, 'bot', ?)",
            [userId, botReply]
        );

        res.json({ reply: botReply });

    } catch (error) {
        console.error("Generation / Save Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Something went wrong processing your campus guide request." });
    }
});
app.listen(5000, () => {
    console.log("Server running on port 5000");
});