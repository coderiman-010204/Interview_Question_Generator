// ======== Element References ========
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const questionsContainer = document.getElementById('questionsContainer');
const generateMoreBtn = document.getElementById('generateMoreBtn');


let uploadedFile = null;
let allQuestions = [];     // Store all generated questions
let displayedCount = 0;    // How many questions shown so far
const QUESTIONS_PER_BATCH = 10; // Show 10 at a time


// ======== Initial Setup ========
document.addEventListener('DOMContentLoaded', () => {
    loading.style.display = 'none';
    results.style.display = 'none';
    fileInfo.style.display = 'none';

    // 🧠 Initialize PDF.js Worker
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }

    // ======== Upload Event Listeners ========
    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    // Generate button listener
    generateBtn.addEventListener('click', generateQuestions);
});

// ======== Handle File Upload & Preview ========
function handleFile(file) {
    const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
        alert('Please upload a PDF or Word document');
        return;
    }

    if (file.size > maxSize) {
        alert('File size must be less than 5MB');
        return;
    }

    uploadedFile = file;
    fileName.textContent = file.name;
    fileInfo.classList.add('show');
    fileInfo.style.display = 'flex';

    // ======== File Preview ========
    let previewContainer = document.getElementById('filePreview');
    if (!previewContainer) {
        previewContainer = document.createElement('div');
        previewContainer.id = 'filePreview';
        previewContainer.style.position = 'relative';
        previewContainer.style.marginTop = '1rem';
        previewContainer.style.padding = '0.5rem 1rem';
        previewContainer.style.border = '1px dashed #ccc';
        previewContainer.style.borderRadius = '8px';
        previewContainer.style.display = 'flex';
        previewContainer.style.alignItems = 'center';
        previewContainer.style.justifyContent = 'space-between';
        uploadArea.appendChild(previewContainer);
    }
    previewContainer.innerHTML = '';

    const icon = document.createElement('span');
    icon.style.fontSize = '1.5rem';
    icon.textContent = file.type === 'application/pdf' ? '📄' : '📃';
    previewContainer.appendChild(icon);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;
    nameSpan.style.marginLeft = '0.5rem';
    nameSpan.style.flexGrow = '1';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';
    previewContainer.appendChild(nameSpan);

    const removeBtn = document.createElement('span');
    removeBtn.textContent = '❌';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.marginLeft = '0.5rem';
    removeBtn.addEventListener('click', () => {
        uploadedFile = null;
        fileInput.value = '';
        previewContainer.remove();
        fileName.textContent = '';
        fileInfo.classList.remove('show');
        fileInfo.style.display = 'none';
    });
    previewContainer.appendChild(removeBtn);
}

// ======== Read File Content ========
async function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        if (file.type === "application/pdf") {
            reader.onload = async (e) => {
                try {
                    const typedarray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                    let text = "";

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map((item) => item.str).join(" ");
                    }

                    resolve(text);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        }
    });
}

// ======== Call Gemini API ========
async function callGemini(resume, position, company, difficulty) {
    try {
        console.log('[callGemini] calling backend...', { position, company, difficulty });

        const resp = await fetch('http://localhost:5000/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume, position, company, difficulty }),
        });

        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            console.error('[callGemini] JSON parse error', err, text);
            throw new Error('Invalid response format from backend.');
        }

        if (Array.isArray(data)) return data;
        if (Array.isArray(data.questions)) return data.questions;

        return [{
            text: 'Unexpected response from server. Please check backend logs.',
            category: 'General',
            difficulty: 'medium'
        }];
    } catch (err) {
        console.error('Error calling Gemini:', err);
        return [{
            text: 'Failed to generate questions. Please try again.',
            category: 'General',
            difficulty: 'medium'
        }];
    }
}

// ======== Display Questions ========
function appendQuestions(reset = false) {
  if (reset) {
    questionsContainer.innerHTML = '';
    displayedCount = 0;
  }

  const remaining = allQuestions.slice(displayedCount, displayedCount + QUESTIONS_PER_BATCH);
  displayedCount += remaining.length;

  remaining.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.innerHTML = `
      <div class="question-header">
        <span class="question-number">Q${displayedCount - remaining.length + i + 1}</span>
        <span class="difficulty ${q.difficulty || 'medium'}">${(q.difficulty || 'medium').toUpperCase()}</span>
      </div>
      <div class="question-text">${q.text || 'No question text available'}</div>
      <div class="question-category">📋 Category: ${q.category || 'General'}</div>
    `;
    questionsContainer.appendChild(card);
  });

  // ✅ Show the "Generate More" button
  generateMoreBtn.style.display = 'inline-block';
  generateMoreBtn.textContent = '➕ Generate More Questions';
}

// ======== Main Function ========
async function generateQuestions() {
    const position = document.getElementById('position').value.trim();
    const company = document.getElementById('company').value.trim();
    const difficulty = document.getElementById('difficulty').value || 'all';

    if (!uploadedFile) {
        alert('Please upload your resume first');
        return;
    }
    if (!position) {
        alert('Please enter the target position');
        return;
    }

    loading.style.display = 'flex';
    results.style.display = 'block';
    generateBtn.disabled = true;
    try {
        const fileText = await readFileContent(uploadedFile);
        const truncatedText = fileText.slice(0, 10000);

        // Save query for future "Generate More" fetches
        lastQuery = {
            resume: truncatedText,
            position,
            company,
            difficulty,
        };

        const questions = await callGemini(truncatedText, position, company, difficulty);

        allQuestions = Array.isArray(questions) ? questions : [];
        displayedCount = 0;

        if (allQuestions.length === 0) {
            questionsContainer.innerHTML = `
                <div class="question-card">
                    <div class="question-text">❌ Failed to generate questions. Please try again.</div>
                    <div class="question-category">📋 Category: General</div>
                </div>
            `;
        } else {
            appendQuestions(true);
        }

        results.style.display = 'block';
    } catch (err) {
        alert('Error generating questions: ' + err.message);
        console.error(err);
    } finally {
        loading.style.display = 'none';
        generateBtn.disabled = false;
    }
}


generateMoreBtn.addEventListener('click', async () => {
  if (displayedCount < allQuestions.length) {
    appendQuestions(false);
    return;
  }

  generateMoreBtn.disabled = true;
  generateMoreBtn.textContent = '⏳ Generating more questions...';

  try {
    const { resume, position, company, difficulty } = lastQuery;
    const newQs = await callGemini(resume, position, company, difficulty);
    if (Array.isArray(newQs) && newQs.length > 0) {
      allQuestions.push(...newQs);
      appendQuestions(false);
    } else {
      generateMoreBtn.textContent = '❌ No more questions available';
    }
  } catch (err) {
    console.error('Error generating more:', err);
    generateMoreBtn.textContent = '⚠️ Failed to generate more';
  } finally {
    generateMoreBtn.disabled = false;
  }
});

