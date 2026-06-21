const axios = require('axios');

async function runDetailedTest() {
    console.log("[!] Initiating RAG Pipeline Diagnostics Integration Test...");
    try {
        console.log("[!] Sending query: 'Tell me about BSc Programmes'");
        const response = await axios.post('http://localhost:5000/chat',
            { message: "Tell me about BSc Programmes" },
            { headers: { 'user-id': '1' } }
        );

        console.log("\n[✓] Raw Response from Server Array Received!");
        console.log("--------------------------------------------------");
        console.log(response.data.reply);
        console.log("--------------------------------------------------");

    } catch (error) {
        console.error("\n[-] Test Failed:", error.response?.data || error.message);
    }
}

runDetailedTest();