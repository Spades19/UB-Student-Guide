const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleBtn");
const themeToggle = document.getElementById("themeToggle");
const textarea = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const messageDisplay = document.getElementById("messageDisplay");
const historyLogsList = document.getElementById("historyLogsList");
const sessionList = document.getElementById("sessionList");
const newSessionBtn = document.getElementById("newSessionBtn");
const historyNav = document.getElementById("historyNav");
const activeSessionLabel = document.getElementById("activeSessionLabel");
const logoutBtn = document.getElementById("logoutBtn");
const adminNavLink = document.querySelector('a[href="admin.html"]');

const BACKEND_URL = "/chat";
const HISTORY_URL = "/api/chat/history";
const SESSIONS_URL = "/api/chat/sessions";
const FEEDBACK_URL = "/api/feedback";

let currentSessionId = localStorage.getItem("activeSessionId") || "";

function getSessionHeaders(includeJson = false) {
    const headers = {
        "Authorization": `Bearer ${localStorage.getItem("studentToken") || ""}`,
        "user-id": (localStorage.getItem("studentId") || "").toString()
    };

    if (includeJson) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

function requireValidSession() {
    const token = localStorage.getItem("studentToken");
    const studentId = localStorage.getItem("studentId");

    if (!token || !studentId || studentId === "undefined" || studentId === "null") {
        alert("Please log in again so your conversations can be saved correctly.");
        localStorage.clear();
        window.location.href = "login.html";
        return false;
    }

    return true;
}

function formatHistoryTime(dateValue) {
    if (!dateValue) return "";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function clearChatWindow() {
    if (!messageDisplay) return;
    messageDisplay.innerHTML = "";
}

function renderSources(container, sources) {
    if (!sources || sources.length === 0) return;

    const sourceWrap = document.createElement("div");
    sourceWrap.className = "source-list";

    sources.forEach((source) => {
        const sourceItem = document.createElement("span");
        sourceItem.className = "source-chip";
        sourceItem.textContent = `${source.category || "Source"}: ${source.heading || "Knowledge base"}`;
        sourceWrap.appendChild(sourceItem);
    });

    container.appendChild(sourceWrap);
}

function renderFeedback(container, messageId) {
    if (!messageId) return;

    const feedbackWrap = document.createElement("div");
    feedbackWrap.className = "feedback-actions";

    const helpfulBtn = document.createElement("button");
    helpfulBtn.type = "button";
    helpfulBtn.textContent = "Helpful";
    helpfulBtn.addEventListener("click", () => submitFeedback(messageId, "helpful", feedbackWrap));

    const notHelpfulBtn = document.createElement("button");
    notHelpfulBtn.type = "button";
    notHelpfulBtn.textContent = "Not helpful";
    notHelpfulBtn.addEventListener("click", () => submitFeedback(messageId, "not_helpful", feedbackWrap));

    feedbackWrap.appendChild(helpfulBtn);
    feedbackWrap.appendChild(notHelpfulBtn);
    container.appendChild(feedbackWrap);
}

function appendMessage(text, sender, options = {}) {
    if (!messageDisplay) return;

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", `${sender}-message`);

    const messageText = document.createElement("div");
    messageText.textContent = text;
    messageDiv.appendChild(messageText);

    if (sender === "bot") {
        renderSources(messageDiv, options.sources);
        renderFeedback(messageDiv, options.messageId);
    }

    messageDisplay.appendChild(messageDiv);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

async function submitFeedback(messageId, rating, feedbackWrap) {
    if (!requireValidSession()) return;

    try {
        const response = await fetch(FEEDBACK_URL, {
            method: "POST",
            headers: getSessionHeaders(true),
            body: JSON.stringify({ messageId, rating })
        });

        const data = await response.json();
        feedbackWrap.innerHTML = "";
        const status = document.createElement("span");
        status.className = "feedback-status";
        status.textContent = response.ok ? "Feedback saved" : (data.error || "Feedback failed");
        feedbackWrap.appendChild(status);
    } catch (error) {
        console.error("Feedback Error:", error);
        feedbackWrap.innerHTML = '<span class="feedback-status">Could not save feedback</span>';
    }
}

function parseSources(rawSources) {
    if (!rawSources) return [];
    if (Array.isArray(rawSources)) return rawSources;

    try {
        return JSON.parse(rawSources);
    } catch (error) {
        return [];
    }
}

function renderHistory(history) {
    if (!historyLogsList) return;

    historyLogsList.innerHTML = "";

    if (!history || history.length === 0) {
        historyLogsList.innerHTML = '<p class="loading-text">No saved messages yet.</p>';
        return;
    }

    history.slice(-20).forEach((item) => {
        const historyBlock = document.createElement("div");
        historyBlock.className = "history-item-block";

        const meta = document.createElement("div");
        meta.className = "history-meta";

        const speaker = document.createElement("span");
        speaker.className = `history-speaker ${item.sender === "user" ? "user-label" : "bot-label"}`;
        speaker.textContent = item.sender === "user" ? "You" : "UB Guide";

        const time = document.createElement("span");
        time.textContent = formatHistoryTime(item.created_at);

        const body = document.createElement("p");
        body.className = "history-body-preview";
        body.textContent = item.message;

        meta.appendChild(speaker);
        meta.appendChild(time);
        historyBlock.appendChild(meta);
        historyBlock.appendChild(body);
        historyLogsList.appendChild(historyBlock);
    });
}

function renderSessions(sessions) {
    if (!sessionList) return;

    sessionList.innerHTML = "";

    if (!sessions || sessions.length === 0) {
        sessionList.innerHTML = '<p class="loading-text">No conversations yet.</p>';
        return;
    }

    sessions.forEach((session) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `session-item ${String(session.id) === String(currentSessionId) ? "active" : ""}`;
        button.textContent = session.title || "Untitled conversation";
        button.addEventListener("click", () => openSession(session.id, session.title));
        sessionList.appendChild(button);
    });
}

async function loadSessions() {
    if (!sessionList || !requireValidSession()) return;

    try {
        const response = await fetch(SESSIONS_URL, {
            method: "GET",
            headers: getSessionHeaders()
        });

        const data = await response.json();
        if (response.ok) {
            renderSessions(data.sessions);
        } else {
            sessionList.innerHTML = `<p class="loading-text">${data.error || "Could not load sessions."}</p>`;
        }
    } catch (error) {
        console.error("Session Fetch Error:", error);
        sessionList.innerHTML = '<p class="loading-text">Could not reach the server.</p>';
    }
}

async function loadChatHistory(sessionId = currentSessionId) {
    if (!historyLogsList || !requireValidSession()) return;

    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    historyLogsList.innerHTML = '<p class="loading-text">Loading your recent conversations...</p>';

    try {
        const response = await fetch(`${HISTORY_URL}${query}`, {
            method: "GET",
            headers: getSessionHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            renderHistory(data.history);
            return data.history || [];
        }

        historyLogsList.innerHTML = `<p class="loading-text">${data.error || "Could not load chat history."}</p>`;
        return [];
    } catch (error) {
        console.error("History Fetch Error:", error);
        historyLogsList.innerHTML = '<p class="loading-text">Could not reach the server for chat history.</p>';
        return [];
    }
}

async function openSession(sessionId, title) {
    currentSessionId = sessionId;
    localStorage.setItem("activeSessionId", sessionId);

    if (activeSessionLabel) {
        activeSessionLabel.textContent = title || "Saved conversation";
    }

    clearChatWindow();
    const history = await loadChatHistory(sessionId);
    history.forEach((item) => {
        appendMessage(item.message, item.sender, {
            messageId: item.sender === "bot" ? item.id : null,
            sources: parseSources(item.sources_json)
        });
    });
    loadSessions();
}

function startNewSession() {
    currentSessionId = "";
    localStorage.removeItem("activeSessionId");

    if (activeSessionLabel) {
        activeSessionLabel.textContent = "Start a new student support conversation.";
    }

    clearChatWindow();
    appendMessage("New chat started. What would you like to ask UB Guide?", "bot");
    loadChatHistory("");
    loadSessions();
}

async function sendMessage() {
    if (!textarea || !messageDisplay || !requireValidSession()) return;

    const messageText = textarea.value.trim();
    if (!messageText) return;

    appendMessage(messageText, "user");
    textarea.value = "";
    textarea.style.height = "auto";

    const loadingDiv = document.createElement("div");
    loadingDiv.classList.add("message", "bot-message");
    loadingDiv.textContent = "Typing...";
    messageDisplay.appendChild(loadingDiv);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: getSessionHeaders(true),
            body: JSON.stringify({
                message: messageText,
                sessionId: currentSessionId || null
            })
        });

        const data = await response.json();
        loadingDiv.remove();

        if (response.ok) {
            currentSessionId = data.sessionId;
            localStorage.setItem("activeSessionId", currentSessionId);
            if (activeSessionLabel) {
                activeSessionLabel.textContent = "Current conversation";
            }
            appendMessage(data.reply, "bot", {
                messageId: data.messageId,
                sources: data.sources
            });
            loadChatHistory(currentSessionId);
            loadSessions();
        } else {
            appendMessage(data.error || "Error: couldn't complete the response.", "bot");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        loadingDiv.remove();
        appendMessage("Network error. Please make sure your server is running.", "bot");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (!requireValidSession()) return;

    if (adminNavLink && localStorage.getItem("studentRole") !== "admin") {
        adminNavLink.closest("li").style.display = "none";
    }

    loadSessions();
    loadChatHistory(currentSessionId);

    if (currentSessionId) {
        openSession(currentSessionId, "Saved conversation");
    }
});

if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
    });
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        document.documentElement.setAttribute("data-theme", currentTheme === "dark" ? "light" : "dark");
    });
}

if (newSessionBtn) {
    newSessionBtn.addEventListener("click", (event) => {
        event.preventDefault();
        startNewSession();
    });
}

if (historyNav) {
    historyNav.addEventListener("click", (event) => {
        event.preventDefault();
        loadChatHistory(currentSessionId);
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to sign out?")) {
            localStorage.clear();
            window.location.href = "login.html";
        }
    });
}

if (textarea) {
    textarea.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });

    textarea.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
}

if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
}
