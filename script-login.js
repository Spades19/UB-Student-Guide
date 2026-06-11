// =======================================================
// UB PORTAL AUTHENTICATION GATEWAY
// =======================================================

// DOM Element Selectors
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Backend Route Endpoints
const LOGIN_URL = "http://localhost:5000/login";
const REGISTER_URL = "http://localhost:5000/register";

// 1. INTERACTIVE TAB TOGGLE VIEW LOGIC
if (loginTab && registerTab && loginForm && registerForm) {
    loginTab.addEventListener('click', () => {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    });

    registerTab.addEventListener('click', () => {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });
}

// 2. REGISTRATION FORM SUBMIT ACTION
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevents the browser from reloading the page

        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        try {
            console.log("Sending registration data to backend...");
            const response = await fetch(REGISTER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message || "Registration successful! Proceeding to Sign In.");
                registerForm.reset();

                // Automatically activate the sign-in visual panel view state
                if (loginTab) loginTab.click();
            } else {
                alert(data.error || "Registration process failed.");
            }
        } catch (error) {
            console.error("Registration Request Error:", error);
            alert("Could not reach the authentication server. Ensure backend is running on port 5000.");
        }
    });
}

// 3. LOGIN FORM SUBMIT ACTION
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
                alert(`Welcome back to UB Portal Guide!`);

                // Set persistent local browser authorization details
                localStorage.setItem("studentToken", data.token);
                localStorage.setItem("studentName", data.user.name);
                localStorage.setItem("studentEmail", data.user.email);

                // Load into central portal main workspace window view (index.html)
                window.location.href = "index.html";
            } else {
                alert(data.error || "Authentication parameters invalid.");
            }
        } catch (error) {
            console.error("Login Request Error:", error);
            alert("Could not reach the authentication server. Check server port connections.");
        }
    });
}

// 4. PEEK PASSWORD UTILITY
function togglePasswordVisibility(inputId) {
    const passwordInput = document.getElementById(inputId);
    if (passwordInput) {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
        } else {
            passwordInput.type = "password";
        }
    }
}