document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const categorySelect = document.getElementById('category-select');
    const subjectSelect = document.getElementById('subject-select');
    const chapterSelect = document.getElementById('chapter-select');
    const topicSelect = document.getElementById('topic-select');
    const questionDisplayArea = document.getElementById('question-display-area');
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressBar = document.getElementById('progress-bar');
    const loadingText = document.getElementById('loading-text');
    const quizModeToggle = document.getElementById('quiz-mode-toggle');

    // State Variables
    let allMetadata = []; 
    let allQuestionsCache = {};
    let currentlyDisplayedQuestions = []; 
    let isQuizMode = false; 

    // ---- Helper Functions ----
    
    function showLoadingOverlay(show) {
        if (!loadingOverlay) return;
        if (show) {
            loadingOverlay.classList.remove('hidden');
        } else {
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, 500);
        }
    }
    
    function updateLoadingProgress(percentage, text = "Loading...") {
        if (!progressBar || !loadingText) return;
        progressBar.style.width = `${percentage}%`;
        loadingText.textContent = text;
    }

    async function fetchMetadata(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) return null;
            const data = await response.json();
            // 🟢 এখানে data.metadata আছে কিনা তা নিশ্চিত করা হচ্ছে
            if (!data.metadata) {
                console.warn(`Metadata missing in file: ${path}`);
                return null;
            }
            return { path: path, metadata: data.metadata };
        } catch (error) {
            console.error(`Failed to fetch or parse metadata from ${path}:`, error);
            return null;
        }
    }
    
    function getSelectedValues(selectElement) {
        if (!selectElement) return [];
        return Array.from(selectElement.options)
            .filter(option => option.selected)
            .map(option => option.value);
    }

    function getUniqueFilterOptions(metadataList, key) {
        const seen = new Set();
        return metadataList.reduce((acc, item) => {
            // 🟢 এখানে Optional Chaining (?) ব্যবহার করে এরর প্রতিরোধ করা হয়েছে
            const option = item.metadata?.[key]; 
            if (option && option.id && !seen.has(option.id)) {
                seen.add(option.id);
                acc.push(option);
            }
            return acc;
        }, []);
    }
    
    function populateDropdown(selectElement, options) {
        if (!selectElement) return;
        const selectedValues = new Set(getSelectedValues(selectElement));
        selectElement.innerHTML = ''; 
        if(options.length === 0){
             const emptyOption = document.createElement('option');
             emptyOption.textContent = "No options available";
             emptyOption.disabled = true;
             selectElement.appendChild(emptyOption);
        }
        options.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option.id;
            optionEl.textContent = option.name;
            if (selectedValues.has(option.id)) {
                optionEl.selected = true;
            }
            selectElement.appendChild(optionEl);
        });
    }

    async function fetchQuestions(path) {
        if (allQuestionsCache[path]) return allQuestionsCache[path];
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            allQuestionsCache[path] = data.questions || []; 
            return data.questions || [];
        } catch (error) {
            console.error(`Failed to fetch questions from ${path}:`, error);
            return []; 
        }
    }

    function setupToggleExplanationButtons(container = document) {
        container.querySelectorAll('.toggle-explanation-btn').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', (event) => {
                const explanation = event.target.nextElementSibling;
                if (explanation) {
                    explanation.classList.toggle('hidden');
                    event.target.textContent = explanation.classList.contains('hidden') ? 'Show Answer & Explanation' : 'Hide Answer & Explanation';
                }
            });
        });
    }
    
    function handleQuizAnswer(questionCard, selectedOptionElement) {
        const questionIndex = parseInt(questionCard.dataset.questionIndex, 10);
        const selectedOptionIndex = parseInt(selectedOptionElement.dataset.optionIndex, 10);
        const questionData = currentlyDisplayedQuestions[questionIndex];
        if (!questionData) return;
        const correctOptionIndex = questionData.correctAnswer;
        const optionsList = selectedOptionElement.parentElement;
        optionsList.classList.add('answered');
        const allOptions = optionsList.querySelectorAll('.option-item-quiz');
        const correctIcon = `<span class="feedback-icon correct-icon">✓</span>`;
        const wrongIcon = `<span class="feedback-icon wrong-icon">✗</span>`;
        if (selectedOptionIndex === correctOptionIndex) {
            selectedOptionElement.classList.add('revealed-correct');
            selectedOptionElement.insertAdjacentHTML('afterbegin', correctIcon);
        } else {
            selectedOptionElement.classList.add('selected-wrong');
            selectedOptionElement.insertAdjacentHTML('afterbegin', wrongIcon);
            if (allOptions[correctOptionIndex]) {
                allOptions[correctOptionIndex].classList.add('revealed-correct');
                allOptions[correctOptionIndex].insertAdjacentHTML('afterbegin', correctIcon);
            }
        }
        const explanationContainer = questionCard.querySelector('.explanation-container');
        if (explanationContainer) {
            const explanationImageHTML = questionData.explanationImage ? `<img src="${questionData.explanationImage}" alt="Explanation Image" class="mcq-image">` : '';
            explanationContainer.innerHTML = `
                <button class="toggle-explanation-btn">Show Answer & Explanation</button>
                <div class="explanation-text hidden">${questionData.explanation || "No explanation provided."}${explanationImageHTML}</div>
            `;
            setupToggleExplanationButtons(explanationContainer);
            if (window.MathJax) {
                MathJax.typesetPromise([explanationContainer]).catch(console.error);
            }
        }
    }

    function displayQuestions(questions) {
        currentlyDisplayedQuestions = questions;
        if(!questionDisplayArea) return;
        questionDisplayArea.innerHTML = '';
        if (questions.length === 0) {
            questionDisplayArea.innerHTML = `<p style="text-align:center;">No questions found for the selected filters.</p>`;
            return;
        }
        questionDisplayArea.innerHTML = `<p style="text-align:center; color: var(--secondary-text-color); margin-bottom: 20px;">Found ${questions.length} question(s).</p>`;
        questions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.dataset.questionIndex = index;
            const questionImageHTML = q.questionImage ? `<img src="${q.questionImage}" alt="Question Image" class="mcq-image">` : '';
            let optionsHTML = `<ol class="options-list" type="a" data-question-index="${index}">`;
            if (isQuizMode) {
                q.options.forEach((opt, optIndex) => {
                    const optionImageHTML = opt.optionImage ? `<img src="${opt.optionImage}" alt="Option Image" class="mcq-image">` : '';
                    optionsHTML += `<li class="option-item-quiz" data-option-index="${optIndex}">${opt.text}${optionImageHTML}</li>`;
                });
            } else {
                q.options.forEach((opt, optIndex) => {
                    const isCorrect = (optIndex === q.correctAnswer);
                    const optionImageHTML = opt.optionImage ? `<img src="${opt.optionImage}" alt="Option Image" class="mcq-image">` : '';
                    optionsHTML += `<li class="${isCorrect ? 'correct-answer' : 'option-item'}">${opt.text}${optionImageHTML}</li>`;
                });
            }
            optionsHTML += '</ol>';
            const explanationImageHTML = q.explanationImage ? `<img src="${q.explanationImage}" alt="Explanation Image" class="mcq-image">` : '';
            const explanationButtonHTML = isQuizMode ? '' : `<button class="toggle-explanation-btn">Show Answer & Explanation</button>`;
            const explanationHTML = `<div class="explanation-text hidden">${q.explanation || "No explanation provided."}${explanationImageHTML}</div>`;
            card.innerHTML = `
                <div class="question-text"><strong>Q${index + 1}:</strong> ${q.question}</div>
                ${questionImageHTML}
                ${optionsHTML}
                <div class="explanation-container">${explanationButtonHTML}${explanationHTML}</div>
            `;
            questionDisplayArea.appendChild(card);
        });

        if (!isQuizMode) {
            setupToggleExplanationButtons();
        }
        
        if (window.MathJax) {
            MathJax.typesetPromise([questionDisplayArea]).catch(console.error);
        }
    }
    
    // ---- Main Logic Functions ----
    function updateDependentDropdowns() {
        const selectedCategories = getSelectedValues(categorySelect);
        const relevantMetadataForSubjects = (selectedCategories.length === 0) ? allMetadata : allMetadata.filter(item => selectedCategories.includes(item.metadata?.category?.id));
        const subjects = getUniqueFilterOptions(relevantMetadataForSubjects, 'subject');
        populateDropdown(subjectSelect, subjects);

        const selectedSubjects = getSelectedValues(subjectSelect);
        const relevantMetadataForChapters = (selectedSubjects.length === 0) ? relevantMetadataForSubjects : relevantMetadataForSubjects.filter(item => selectedSubjects.includes(item.metadata?.subject?.id));
        const chapters = getUniqueFilterOptions(relevantMetadataForChapters, 'chapter');
        populateDropdown(chapterSelect, chapters);

        const selectedChapters = getSelectedValues(chapterSelect);
        const relevantMetadataForTopics = (selectedChapters.length === 0) ? relevantMetadataForChapters : relevantMetadataForChapters.filter(item => selectedChapters.includes(item.metadata?.chapter?.id));
        const topics = getUniqueFilterOptions(relevantMetadataForTopics, 'topic');
        populateDropdown(topicSelect, topics);
    }
    
    async function filterAndDisplayQuestions() {
        showLoadingOverlay(true);
        updateLoadingProgress(0, 'Filtering questions...');

        const selectedCategories = getSelectedValues(categorySelect);
        const selectedSubjects = getSelectedValues(subjectSelect);
        const selectedChapters = getSelectedValues(chapterSelect);
        const selectedTopics = getSelectedValues(topicSelect);

        const matchingFiles = allMetadata.filter(item => {
            const md = item.metadata;
            const categoryMatch = (selectedCategories.length === 0 || selectedCategories.includes(md?.category?.id));
            const subjectMatch = (selectedSubjects.length === 0 || selectedSubjects.includes(md?.subject?.id));
            const chapterMatch = (selectedChapters.length === 0 || selectedChapters.includes(md?.chapter?.id));
            const topicMatch = (selectedTopics.length === 0 || selectedTopics.includes(md?.topic?.id));
            return categoryMatch && subjectMatch && chapterMatch && topicMatch;
        }).map(item => item.path);

        if (matchingFiles.length === 0) {
            displayQuestions([]);
            showLoadingOverlay(false);
            return;
        }

        try {
            const totalFiles = matchingFiles.length;
            let filesProcessed = 0;
            updateLoadingProgress(10, `Found ${totalFiles} file(s) to load...`);
            
            const questionPromises = matchingFiles.map(path => 
                fetchQuestions(path).then(result => {
                    filesProcessed++;
                    const percentage = 10 + Math.round((filesProcessed / totalFiles) * 75);
                    updateLoadingProgress(percentage, `Loading content ${filesProcessed} of ${totalFiles}...`);
                    return result;
                })
            );
            
            const questionArrays = await Promise.all(questionPromises);
            const allMatchingQuestions = [].concat(...questionArrays);
            
            updateLoadingProgress(90, 'Preparing display...');
            displayQuestions(allMatchingQuestions);
            
            updateLoadingProgress(95, 'Formatting equations...');
            if (window.MathJax) {
                await MathJax.typesetPromise([questionDisplayArea]);
            }
            
            updateLoadingProgress(100, 'Done!');
            showLoadingOverlay(false);
        } catch (error) {
            console.error("Error displaying questions:", error);
            showLoadingOverlay(false);
        }
    }

    function handleFilterChange() {
        updateDependentDropdowns();
        filterAndDisplayQuestions();
    }
    
    function setupEventListeners() {
        if(categorySelect) categorySelect.addEventListener('change', handleFilterChange);
        if(subjectSelect) subjectSelect.addEventListener('change', handleFilterChange);
        if(chapterSelect) chapterSelect.addEventListener('change', handleFilterChange);
        if(topicSelect) topicSelect.addEventListener('change', handleFilterChange);
        
        if (quizModeToggle) {
            quizModeToggle.addEventListener('change', (event) => {
                isQuizMode = event.target.checked;
                displayQuestions(currentlyDisplayedQuestions); 
            });
        }
        
        if(questionDisplayArea) {
            questionDisplayArea.addEventListener('click', (event) => {
                if (!isQuizMode) return;
                const clickedOption = event.target.closest('.option-item-quiz');
                if (clickedOption && !clickedOption.parentElement.classList.contains('answered')) {
                    const questionCard = clickedOption.closest('.question-card');
                    handleQuizAnswer(questionCard, clickedOption);
                }
            });
        }
    }
    
    // ---- App Initialization ----
    async function initializeApp() {
        showLoadingOverlay(true);
        updateLoadingProgress(10, 'Initializing...');
        try {
            if (typeof chapterFiles === 'undefined' || !Array.isArray(chapterFiles)) {
                throw new Error("Could not find 'chapterFiles' array. Ensure 'config.js' is loaded correctly before 'script.js'.");
            }
            if (chapterFiles.length === 0) {
                throw new Error("'config.js' is empty. Please add paths to your JSON files.");
            }
            
            updateLoadingProgress(25, 'Loading configuration...');
            const metadataPromises = chapterFiles.map(path => fetchMetadata(path));
            allMetadata = (await Promise.all(metadataPromises)).filter(m => m !== null);
            
            if(allMetadata.length === 0){
                throw new Error("Could not load metadata from any JSON files. Check file paths and JSON format.");
            }
            
            updateLoadingProgress(50, 'Setting up filters...');
            const allCategories = getUniqueFilterOptions(allMetadata, 'category');
            populateDropdown(categorySelect, allCategories);
            updateDependentDropdowns();
            
            setupEventListeners();
            await filterAndDisplayQuestions(); 
        } catch (error) {
            console.error("Initialization Failed:", error);
            if(questionDisplayArea) questionDisplayArea.innerHTML = `<p style="color:red; text-align:center;"><b>Initialization Failed:</b> ${error.message}</p>`;
            showLoadingOverlay(false);
        }
    }

    initializeApp();
});