# UB-Student-Guide
A full-stack campus assistant chatbot for the University of Buea (UB) utilizing a custom lightweight RAG pipeline, Node.js/Express, MySQL persistence, and the Gemini API

# UB Guide AI 🇨🇲

An authentic, supportive, and knowledgeable full-stack campus assistant designed specifically for students at the University of Buea (UB). This application acts as a smart peer-to-peer guide, helping students navigate official academic regulations, campus procedures, and general student life.

## 🚀 Features Built So Far

- **Dual-Lane Routing Prompt Matrix:** Intelligently separates official academic requests (strict handbook context lane) from general student life advice or greetings (conversational lane).
- **Custom Token-Matching RAG Engine:** Parses a local PDF knowledge base (`knowledge_chunks.json`) using keyword token scoring to inject hyper-local UB context into the LLM prompt.
- **Secure Authentication & Session Tracking:** Student registration and login managed via `bcryptjs` password hashing and JWT tokens, with strict frontend route protection.
- **Relational Chat Persistence:** Securely commits every single user message and bot reply into a MySQL database with strict foreign-key integrity linking back to the authenticated student profile.
- **Clean UI & Theme Workspace:** Lightweight frontend featuring a collapsible sidebar workspace and togglable dark/light display layouts.

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Local Storage session control)
- **Backend:** Node.js, Express.js, Axios
- **Database:** MySQL (`mysql2` connection pooling)
- **AI Integration:** Google Gemini API (`gemini-3-flash`)

## ⚙️ Core Configuration Variables

To run this project locally, ensure you have a `.env` file in your root directory containing:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ub_guide_db
JWT_SECRET=your_secure_jwt_secret_key
GEMINI_API_KEY=your_google_gemini_api_key
