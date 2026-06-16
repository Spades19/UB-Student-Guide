const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

// Target URLs - Updated with clean, active structural paths on the UB domain
const targetUrls = [
    //{ url: 'https://fs.ubuea2.cm/index.php/abc/bachelor-s-degree-programmes/35-academics/courses/1055-about-courses', category: 'courses' },
    { url: 'https://fs.ubuea2.cm/index.php/abc/bachelor-s-degree-programmes', category: 'undergrauate programs' },
    //  { url: 'https://www.ubuea.cm/about/history/', category: 'about' },
    //  { url: 'https://www.ubuea.cm/students/student-services/', category: 'student services' }
];

// Browser headers to prevent the UB firewall from treating your request as a bot attack
const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
};

async function scrapeResource(target) {
    const isPdf = target.url.toLowerCase().endsWith('.pdf');

    try {
        if (isPdf) {
            return await processPdfResource(target);
        } else {
            return await processHtmlResource(target);
        }
    } catch (error) {
        console.error(`[-] Failed to connect to ${target.url}: ${error.message}`);
        return null;
    }
}

// 1. Pipeline for Standard HTML Web Pages
async function processHtmlResource({ url, category }) {
    console.log(`[!] Scraping HTML page: ${url}`);
    const { data } = await axios.get(url, {
        headers: browserHeaders,
        timeout: 12000
    });

    const $ = cheerio.load(data);
    const pageTitle = $('title').text().trim();
    const structuredContent = [];

    // Expanded the selector array to capture structural post contents, entry-blocks, and text widgets
    const contentBlock = $('.entry-content, article, main, .post-content, #content, body');
    const targetBlock = contentBlock.length === 0 ? $('body') : contentBlock.first();

    let currentHeading = "General Information";
    let blockCount = 0;

    // Included 'li' and structural content layout blocks since UB lists admission criteria using bullets
    targetBlock.find('h1, h2, h3, h4, p, li, td').each((i, el) => {
        const tagName = el.tagName.toLowerCase();
        const textContent = $(el).text().replace(/\s+/g, ' ').trim();

        // Filter out empty spaces or short, uninformative layout text fragments
        if (!textContent || textContent.length < 15) return;

        if (tagName.startsWith('h')) {
            currentHeading = textContent;
        } else {
            blockCount++;
            structuredContent.push({
                heading: currentHeading,
                text: textContent
            });
        }
    });

    console.log(`    -> Extracted ${blockCount} data fields from "${pageTitle}"`);

    return structuredContent.length > 0 ? {
        url,
        title: pageTitle,
        category,
        scraped_at: new Date().toISOString(),
        content: structuredContent
    } : null;
}

// 2. New Pipeline for Extracting Text from PDFs
async function processPdfResource({ url, category }) {
    console.log(`[!] Downloading and parsing PDF: ${url}`);

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: browserHeaders,
        timeout: 15000
    });

    const pdfBuffer = Buffer.from(response.data);
    const parsedPdf = await pdfParse(pdfBuffer);
    const rawText = parsedPdf.text;

    const rawParagraphs = rawText.split(/\n\s*\n/);
    const structuredContent = [];
    let logicalHeading = "Document Content";

    rawParagraphs.forEach((paragraph) => {
        const cleanText = paragraph.replace(/\s+/g, ' ').trim();
        if (cleanText.length < 20) return;

        if (cleanText.length < 60 && (cleanText === cleanText.toUpperCase() || cleanText.startsWith('Section') || cleanText.startsWith('ARTICLE'))) {
            logicalHeading = cleanText;
        } else {
            structuredContent.push({
                heading: logicalHeading,
                text: cleanText
            });
        }
    });

    const filename = path.basename(url);

    return structuredContent.length > 0 ? {
        url,
        title: filename,
        category,
        scraped_at: new Date().toISOString(),
        content: structuredContent
    } : null;
}

// Orchestrator to run the pipeline
async function runPipeline() {
    const knowledgeBase = [];

    for (const target of targetUrls) {
        const result = await scrapeResource(target);
        if (result) {
            knowledgeBase.push(result);
            console.log(`[✓] Successfully collected content from: "${result.title}"`);
        } else {
            console.log(`[-] Warning: No valid blocks extracted from: ${target.url}`);
        }
        // Delay block to protect your script from being throttled
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const outputPath = path.join(__dirname, 'ub_knowledge_base.json');
    fs.writeFileSync(outputPath, JSON.stringify(knowledgeBase, null, 2), 'utf-8');
    console.log(`\n[✓] Pipeline execution finished. Combined results saved to: ${outputPath}`);
}

runPipeline();