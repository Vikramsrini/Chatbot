document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.querySelector('.file-upload-label span');

    // Early exit if required elements are missing
    if (!chatBox || !userInput || !sendButton || !fileInput || !fileLabel) {
        console.error('Critical DOM elements missing');
        return;
    }

    // State variables
    let isSending = false;
    let messageQueue = [];

    // DOM Manipulation Functions
    function createMessageElement(role, content, fileInfo = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = formatMessageContent(content);

        messageDiv.appendChild(contentDiv);

        if (fileInfo) {
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'media-container';

            if (fileInfo.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = fileInfo.url;
                img.className = 'media-preview';
                img.alt = 'Uploaded content preview';
                mediaContainer.appendChild(img);
            } else if (fileInfo.type === 'application/pdf') {
                const link = document.createElement('a');
                link.href = fileInfo.url;
                link.textContent = 'View PDF';
                link.className = 'file-link';
                link.target = '_blank';
                mediaContainer.appendChild(link);
            } else if (fileInfo.type.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = fileInfo.url;
                audio.className = 'audio-player';
                mediaContainer.appendChild(audio);
            }

            messageDiv.appendChild(mediaContainer);
        }

        return messageDiv;
    }

    function displayMessage(role, content, fileInfo = null) {
        const messageElement = createMessageElement(role, content, fileInfo);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        chatBox.appendChild(errorElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showLoadingIndicator() {
        const loadingElement = document.createElement('div');
        loadingElement.className = 'message bot-message loading-indicator';
        loadingElement.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
        chatBox.appendChild(loadingElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return loadingElement;
    }

    function removeLoadingIndicator(loadingElement) {
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.remove();
        }
    }

    // API Communication
    async function sendToBackend(formData) {
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server responded with status ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Message Handling
    async function processMessageQueue() {
        if (isSending || messageQueue.length === 0) return;

        isSending = true;
        const { userMessage, file } = messageQueue.shift();
        const loadingElement = showLoadingIndicator();

        try {
            const formData = new FormData();
            let fileInfo = null;

            if (file) {
                formData.append('file', file);
                fileInfo = {
                    url: URL.createObjectURL(file),
                    type: file.type,
                    name: file.name
                };
                displayMessage('user', `Uploaded file: ${file.name}`, fileInfo);
            }

            if (userMessage && !file) {
                displayMessage('user', userMessage);
            }

            if (userMessage) {
                formData.append('message', userMessage);
            }

            const response = await sendToBackend(formData);
            removeLoadingIndicator(loadingElement);

            if (response.error) {
                throw new Error(response.error);
            }

            if (response.file_url) {
                displayMessage('bot', response.reply, {
                    url: response.file_url,
                    type: file?.type || 'application/octet-stream'
                });
            } else {
                displayMessage('bot', response.reply);
            }
        } catch (error) {
            removeLoadingIndicator(loadingElement);
            showError(error.message || 'Failed to process your request');
        } finally {
            isSending = false;
            processMessageQueue(); // Process next message if any
        }
    }

    function queueMessage(userMessage, file) {
        messageQueue.push({ userMessage, file });
        processMessageQueue();
    }
    function formatMessageContent(text) {
        const escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    
        return escaped
            // Code blocks (triple backticks)
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italics
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Line breaks
            .replace(/\n/g, '<br>');
    }
    

    // Event Handlers
    function handleSend() {
        const userMessage = userInput.value.trim();
        const file = fileInput.files[0];

        if (!userMessage && !file) {
            showError('Please enter a message or upload a file');
            return;
        }

        queueMessage(userMessage, file);

        // Clear inputs
        userInput.value = '';
        fileInput.value = '';
        fileLabel.textContent = 'Upload File';
    }

    function handleFileChange() {
        if (fileInput.files.length > 0) {
            fileLabel.textContent = fileInput.files[0].name;
        } else {
            fileLabel.textContent = 'Upload File';
        }
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    // Event Listeners
    sendButton.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', handleKeyPress);
    fileInput.addEventListener('change', handleFileChange);

    // Initial focus
    userInput.focus();
});
