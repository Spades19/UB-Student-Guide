// =======================================================
// UB PORTAL AUTHENTICATION GATEWAY
// =======================================================

// DOM Element Selectors
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const resetTab = document.getElementById('resetTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const resetForm = document.getElementById('resetForm');
const requestResetCodeBtn = document.getElementById('requestResetCodeBtn');

// Backend Route Endpoints
const LOGIN_URL = "/login";
const REGISTER_URL = "/register";
const RESET_PASSWORD_URL = "/reset-password";
const REQUEST_PASSWORD_RESET_URL = "/request-password-reset";

// 1. INTERACTIVE TAB TOGGLE VIEW LOGIC
function showAuthForm(activeTab, activeForm) {
    [loginTab, registerTab, resetTab].forEach((tab) => {
        if (tab) tab.classList.toggle('active', tab === activeTab);
    });

    [loginForm, registerForm, resetForm].forEach((form) => {
        if (form) form.classList.toggle('hidden', form !== activeForm);
    });
}

if (loginTab && registerTab && resetTab && loginForm && registerForm && resetForm) {
    loginTab.addEventListener('click', () => {
        showAuthForm(loginTab, loginForm);
    });

    registerTab.addEventListener('click', () => {
        showAuthForm(registerTab, registerForm);
    });

    resetTab.addEventListener('click', () => {
        showAuthForm(resetTab, resetForm);
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

// 3. PASSWORD RESET CODE REQUEST ACTION
if (requestResetCodeBtn) {
    requestResetCodeBtn.addEventListener('click', async () => {
        const email = document.getElementById('resetEmail').value.trim();

        if (!email) {
            alert("Enter your account email first.");
            return;
        }

        try {
            const response = await fetch(REQUEST_PASSWORD_RESET_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });

            const data = await response.json();
            alert(data.message || "If the email exists, a reset code has been generated.");
        } catch (error) {
            console.error("Password Reset Code Request Error:", error);
            alert("Could not reach the server. Check server port connections.");
        }
    });
}

// 4. PASSWORD RESET FORM SUBMIT ACTION
if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('resetEmail').value.trim();
        const resetCode = document.getElementById('resetCode').value.trim();
        const newPassword = document.getElementById('resetPassword').value;
        const confirmPassword = document.getElementById('confirmResetPassword').value;

        if (newPassword !== confirmPassword) {
            alert("The new passwords do not match.");
            return;
        }

        try {
            const response = await fetch(RESET_PASSWORD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, resetCode, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message || "Password reset successful. Please log in.");
                resetForm.reset();
                showAuthForm(loginTab, loginForm);
            } else {
                alert(data.error || "Password reset failed.");
            }
        } catch (error) {
            console.error("Password Reset Request Error:", error);
            alert("Could not reach the server. Check server port connections.");
        }
    });
}

// 5. LOGIN FORM SUBMIT ACTION
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

                const studentId = data.user?.id || data.user?.userId || data.user?.studentId || data.user?._id;

                if (!studentId) {
                    alert("Login worked, but the server did not return your student ID. Please check the backend login response.");
                    return;
                }

                // Set persistent local browser authorization details
                localStorage.setItem("studentToken", data.token);
                localStorage.setItem("studentId", studentId);
                localStorage.setItem("studentName", data.user.name);
                localStorage.setItem("studentEmail", data.user.email);
                localStorage.setItem("studentRole", data.user.role || "student");

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

// 6. PEEK PASSWORD UTILITY
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
