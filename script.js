// 1. SELECT ALL CORE DOM ELEMENTS
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleBtn');
const themeToggle = document.getElementById('themeToggle');
const textarea = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messageDisplay = document.getElementById('messageDisplay');

// Authentication Form Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginTab = document.querySelector('.tab-btn[data-tab="login"]');

// Backend Route Endpoints
const BACKEND_URL = "http://localhost:5000/chat";
const LOGIN_URL = "http://localhost:5000/login";
const REGISTER_URL = "http://localhost:5000/register";

// =======================================================
// SESSION CONTROL & ROUTE PROTECTION
// =======================================================
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("studentToken");
    const studentName = localStorage.getItem("studentName");
    const currentPage = window.location.pathname.split("/").pop();

    // Protect the chat page from unauthorized access
    if (!token && (currentPage === "index.html" || currentPage === "")) {
        if (textarea) {
            alert("Access Denied. Please log in with your student credentials first.");
            window.location.href = "login.html";
            return;
        }
    }

    // Update profile display names if present
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay && studentName) {
        usernameDisplay.textContent = studentName;
    }
});

// =======================================================
// AUTHENTICATION INTERACTIVE CONTROLLERS
// =======================================================

// Register Form Handler
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        try {
            const response = await fetch(REGISTER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message || "Registration successful! Proceeding to Sign In.");
                registerForm.reset();
                if (loginTab) loginTab.click();
            } else {
                alert(data.error || "Registration process failed.");
            }
        } catch (error) {
            console.error("Registration Request Error:", error);
            alert("Could not reach the authentication server.");
        }
    });
}

// Login Form Handler
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch(LOGIN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                alert(`Welcome back, ${data.user?.name || 'Student'}!`);

                // 🕵️‍♂️ BULLETPROOF ID DETECTION
                // We will check every single common way a backend sends back a user ID
                let extractedId = null;

                if (data.user) {
                    extractedId = data.user.id || data.user.userId || data.user._id || data.user.studentId;
                } else {
                    extractedId = data.id || data.userId || data.studentId;
                }

                // If we STILL can't find it, we will fallback to a temporary mock ID 
                // so your chat function doesn't crash while you work on the backend!
                if (!extractedId) {
                    console.warn("Backend didn't send a clear ID structure. Using session fallback.");
                    extractedId = "temp_session_1";
                }

                // Store all returned session fields explicitly
                localStorage.setItem("studentToken", data.token || "mock_token");
                localStorage.setItem("studentId", extractedId);
                localStorage.setItem("studentName", data.user?.name || "Student");
                localStorage.setItem("studentEmail", data.user?.email || "");

                // Redirect to the main workspace
                window.location.href = "index.html";
            } else {
                alert(data.error || "Authentication credentials invalid.");
            }
        } catch (error) {
            console.error("Login Request Error:", error);
            alert("Could not reach the server. Make sure your backend application is active.");
        }
    });
}

// =======================================================
// SIDEBAR, THEME & LAYOUT CONTROLLERS
// =======================================================
if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            themeToggle.textContent = '🌙 Dark';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.textContent = '☀️ Light';
        }
    });
}

if (textarea) {
    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
}

// =======================================================
// SYSTEM LOGOUT INTERACTION CONTROLLER
// =======================================================
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to sign out?")) {
            localStorage.clear();
            window.location.href = "login.html";
        }
    });
}

// =======================================================
// MAIN LIVE CHAT SYSTEM
// =======================================================
function appendMessage(text, sender) {
    if (!messageDisplay) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    messageDiv.textContent = text;

    messageDisplay.appendChild(messageDiv);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

async function sendMessage() {
    if (!textarea || !messageDisplay) return;

    const messageText = textarea.value.trim();
    if (!messageText) return;

    // 🔄 FORCE FETCH FRESH CREDENTIALS RIGHT ON SEND ACTION
    const studentId = localStorage.getItem("studentId");
    const studentToken = localStorage.getItem("studentToken");

    // Safety check: ensure identity exists locally before sending
    if (!studentId || studentId === "undefined" || studentId === "null") {
        alert("Session identity missing. Please log in again.");
        window.location.href = "login.html";
        return;
    }

    // Render client side bubble immediately
    appendMessage(messageText, 'user');

    // Clean textarea slate
    textarea.value = '';
    textarea.style.height = 'auto';

    // Temporary typing indicator container
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('message', 'bot-message');
    loadingDiv.textContent = "Typing...";
    messageDisplay.appendChild(loadingDiv);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${studentToken}`, // Good practice to include token authentication
                "user-id": studentId.toString()           // Explicitly convert to string for safe network transmission
            },
            body: JSON.stringify({ message: messageText })
        });

        const data = await response.json();
        loadingDiv.remove();

        if (response.ok) {
            appendMessage(data.reply, 'bot');
        } else {
            appendMessage(data.error || "Error: Couldn't complete response layout.", 'bot');
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        loadingDiv.remove();
        appendMessage("Network error. Please make sure your server is running.", 'bot');
    }
}
// Chat Action Triggers
if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

if (textarea) {
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}