const axios = require('axios');

async function runTest() {
    console.log("[!] Initiating RAG Pipeline Integration Test...");
    try {
        const response = await axios.post('http://localhost:5000/chat',
            { message: "Tell me about BSc Programmes" },
            { headers: { 'user-id': '1' } } // Mocking user ID 1
        );

        console.log("\n[✓] Response Received from UB Guide AI:\n");
        console.log(response.data.reply);
    } catch (error) {
        console.error("\n[-] Test Failed:", error.response?.data || error.message);
    }
}

runTest();