const API_BASE = "";

const knowledgeForm = document.getElementById("knowledgeForm");
const knowledgeId = document.getElementById("knowledgeId");
const knowledgeCategory = document.getElementById("knowledgeCategory");
const knowledgeSource = document.getElementById("knowledgeSource");
const knowledgeHeading = document.getElementById("knowledgeHeading");
const knowledgeContent = document.getElementById("knowledgeContent");
const resetKnowledgeForm = document.getElementById("resetKnowledgeForm");
const knowledgeList = document.getElementById("knowledgeList");
const unansweredList = document.getElementById("unansweredList");
const recentQuestionsList = document.getElementById("recentQuestionsList");

function requireAdminPageAccess() {
    const token = localStorage.getItem("studentToken");
    const role = localStorage.getItem("studentRole");

    if (!token || role !== "admin") {
        alert("Admin access only. Please log in with an admin account.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

function adminHeaders(includeJson = false) {
    const headers = {
        "Authorization": `Bearer ${localStorage.getItem("studentToken") || ""}`
    };

    if (includeJson) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? 0;
}

function clearKnowledgeForm() {
    knowledgeId.value = "";
    knowledgeCategory.value = "";
    knowledgeSource.value = "";
    knowledgeHeading.value = "";
    knowledgeContent.value = "";
}

async function loadAnalytics() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/analytics`, {
            headers: adminHeaders()
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Analytics failed");

        setText("totalUsers", data.totals.users);
        setText("totalMessages", data.totals.messages);
        setText("totalSessions", data.totals.sessions);
        setText("openUnanswered", data.totals.openUnanswered);
        setText("helpfulCount", data.totals.helpful);
        setText("notHelpfulCount", data.totals.notHelpful);

        recentQuestionsList.innerHTML = "";
        data.recentQuestions.forEach((item) => {
            const block = document.createElement("div");
            block.className = "admin-list-item";
            block.textContent = item.message;
            recentQuestionsList.appendChild(block);
        });
    } catch (error) {
        console.error("Analytics Error:", error);
    }
}

async function loadKnowledge() {
    knowledgeList.innerHTML = '<p class="loading-text">Loading knowledge records...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/admin/knowledge`, {
            headers: adminHeaders()
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Knowledge load failed");

        knowledgeList.innerHTML = "";
        data.knowledge.forEach((item) => {
            const block = document.createElement("div");
            block.className = "admin-list-item";

            const title = document.createElement("h3");
            title.textContent = item.section_heading;

            const meta = document.createElement("p");
            meta.className = "admin-meta";
            meta.textContent = `${item.category || "General"} | ${item.source_url || "No source"}`;

            const preview = document.createElement("p");
            preview.textContent = item.content_text.length > 180 ? `${item.content_text.substring(0, 180)}...` : item.content_text;

            const actions = document.createElement("div");
            actions.className = "admin-actions";

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
                knowledgeId.value = item.id;
                knowledgeCategory.value = item.category || "";
                knowledgeSource.value = item.source_url || "";
                knowledgeHeading.value = item.section_heading || "";
                knowledgeContent.value = item.content_text || "";
                window.scrollTo({ top: 0, behavior: "smooth" });
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => deleteKnowledge(item.id));

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            block.appendChild(title);
            block.appendChild(meta);
            block.appendChild(preview);
            block.appendChild(actions);
            knowledgeList.appendChild(block);
        });
    } catch (error) {
        console.error("Knowledge Error:", error);
        knowledgeList.innerHTML = '<p class="loading-text">Could not load knowledge records.</p>';
    }
}

async function saveKnowledge(event) {
    event.preventDefault();

    const id = knowledgeId.value;
    const payload = {
        category: knowledgeCategory.value.trim(),
        source_url: knowledgeSource.value.trim(),
        section_heading: knowledgeHeading.value.trim(),
        content_text: knowledgeContent.value.trim()
    };

    const url = id ? `${API_BASE}/api/admin/knowledge/${id}` : `${API_BASE}/api/admin/knowledge`;
    const method = id ? "PUT" : "POST";

    try {
        const response = await fetch(url, {
            method,
            headers: adminHeaders(true),
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Save failed");

        clearKnowledgeForm();
        loadKnowledge();
        loadAnalytics();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteKnowledge(id) {
    if (!confirm("Delete this knowledge entry?")) return;

    try {
        const response = await fetch(`${API_BASE}/api/admin/knowledge/${id}`, {
            method: "DELETE",
            headers: adminHeaders()
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Delete failed");

        loadKnowledge();
    } catch (error) {
        alert(error.message);
    }
}

async function loadUnanswered() {
    unansweredList.innerHTML = '<p class="loading-text">Loading unanswered questions...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/admin/unanswered`, {
            headers: adminHeaders()
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Unanswered load failed");

        unansweredList.innerHTML = "";
        data.unanswered.forEach((item) => {
            const block = document.createElement("div");
            block.className = "admin-list-item";

            const title = document.createElement("h3");
            title.textContent = item.question;

            const meta = document.createElement("p");
            meta.className = "admin-meta";
            meta.textContent = `${item.status} | ${item.student_name || "Unknown student"}`;

            const actions = document.createElement("div");
            actions.className = "admin-actions";

            ["reviewed", "resolved"].forEach((status) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = status;
                btn.addEventListener("click", () => updateUnansweredStatus(item.id, status));
                actions.appendChild(btn);
            });

            block.appendChild(title);
            block.appendChild(meta);
            block.appendChild(actions);
            unansweredList.appendChild(block);
        });
    } catch (error) {
        console.error("Unanswered Error:", error);
        unansweredList.innerHTML = '<p class="loading-text">Could not load unanswered questions.</p>';
    }
}

async function updateUnansweredStatus(id, status) {
    try {
        const response = await fetch(`${API_BASE}/api/admin/unanswered/${id}`, {
            method: "PUT",
            headers: adminHeaders(true),
            body: JSON.stringify({ status })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Status update failed");

        loadUnanswered();
        loadAnalytics();
    } catch (error) {
        alert(error.message);
    }
}

if (requireAdminPageAccess()) {
    if (knowledgeForm) knowledgeForm.addEventListener("submit", saveKnowledge);
    if (resetKnowledgeForm) resetKnowledgeForm.addEventListener("click", clearKnowledgeForm);

    loadAnalytics();
    loadKnowledge();
    loadUnanswered();
}
