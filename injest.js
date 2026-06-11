const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse'); // This imports the class/constructor

async function processStudentGuide() {
    try {
        const pdfPath = path.join(__dirname, 'student_guide.pdf');

        console.log(`Checking for file at: ${pdfPath}`);

        if (!fs.existsSync(pdfPath)) {
            console.error("\n[ERROR] File not found! Make sure your PDF is named exactly 'student_guide.pdf' and placed inside your main folder.");
            return;
        }

        console.log("Reading student_guide.pdf...");
        const dataBuffer = fs.readFileSync(pdfPath);

        let pdfData;

        // 1. Check if the module is a class/constructor that needs the 'new' keyword
        try {
            // Try treating it as a class constructor (handles the 'new' error)
            const ParserClass = pdfParse.PDFParse || pdfParse.default || pdfParse;

            // Try compiling with standard fallback or instantiating with 'new'
            if (typeof ParserClass === 'function') {
                try {
                    // Try the classic way first
                    pdfData = await ParserClass(dataBuffer);
                } catch (err) {
                    if (err.message.includes("cannot be invoked without 'new'") || err.message.includes("Class constructor")) {
                        // If it's a v2 class constructor, instantiate it with new
                        console.log("Modern class constructor detected. Instantiating with 'new' keyword...");

                        // Some v2 libraries parse automatically on instantiation or have a separate method
                        const instance = new ParserClass(dataBuffer);
                        if (typeof instance.render === 'function') pdfData = await instance.render();
                        else if (typeof instance.getText === 'function') {
                            const text = await instance.getText();
                            pdfData = { text: text.text || text, numpages: instance.numpages };
                        } else {
                            pdfData = instance; // Fallback assignment
                        }
                    } else {
                        throw err;
                    }
                }
            }
        } catch (innerError) {
            console.log("Class auto-detection bypassed, attempting secondary extractors...");
        }

        // 2. If the complex class check didn't populate pdfData, use an ultimate direct fallback string check
        if (!pdfData || !pdfData.text) {
            // Hard fallback if the module exports a wrapping object with structural parsing keys
            const parseFunc = pdfParse.parse || pdfParse.pdf || pdfParse;
            if (typeof parseFunc === 'function') {
                pdfData = await parseFunc(dataBuffer);
            } else if (pdfParse.PDFParse) {
                // Explicit v2 handling strategy
                const parserInstance = new pdfParse.PDFParse({ data: dataBuffer });
                const result = await parserInstance.getText();
                pdfData = { text: result.text || result, numpages: parserInstance.numpages };
            }
        }

        const rawText = pdfData ? pdfData.text : null;
        if (!rawText) {
            throw new Error("Could not extract text structure. The module exports might be incompatible.");
        }

        console.log(`Extracted text successfully. Cleaning content...`);

        // Split text into lines and clean up whitespace
        const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        let chunks = [];
        let currentChunk = "";

        // Group lines into chunks of roughly 150-200 words for the RAG engine
        for (let line of lines) {
            currentChunk += line + " ";
            if (currentChunk.split(" ").length > 150) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
        }
        if (currentChunk) chunks.push(currentChunk.trim());

        const jsonPath = path.join(__dirname, 'knowledge_chunks.json');
        fs.writeFileSync(jsonPath, JSON.stringify(chunks, null, 2));
        console.log(`\n[SUCCESS] Successfully indexed ${chunks.length} custom knowledge chunks into knowledge_chunks.json!`);

    } catch (error) {
        console.error("\n[CRITICAL ERROR] Failed to ingest PDF guide:", error.message);
    }
}

// Execute the unified ingestion loop
processStudentGuide();