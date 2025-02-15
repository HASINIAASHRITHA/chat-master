// Get Firebase services from window object
const { auth, db, storage } = window;

// Global Variables
let currentUser = null;
let currentChat = null;
let currentUserStatus = null;

// DOM Elements
const authContainer = document.getElementById('authContainer');
const chatContainer = document.getElementById('chatContainer');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authTabs = document.querySelectorAll('.auth-tab');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const messagesContainer = document.getElementById('messagesContainer');
const chatList = document.getElementById('chatList');
const userSearch = document.getElementById('userSearch');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const logoutBtn = document.getElementById('logoutBtn');

// More Options Menu Handler
const moreOptionsBtn = document.getElementById('moreOptionsBtn');
const moreOptionsMenu = document.getElementById('moreOptionsMenu');

moreOptionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreOptionsMenu.classList.toggle('active');
});

// Close more options menu when clicking outside
document.addEventListener('click', (e) => {
    if (!moreOptionsMenu.contains(e.target) && e.target !== moreOptionsBtn) {
        moreOptionsMenu.classList.remove('active');
    }
});

// Handle more options menu items
moreOptionsMenu.querySelectorAll('li').forEach(item => {
    item.addEventListener('click', () => {
        const action = item.textContent.trim();
        handleMoreOptionsAction(action);
        moreOptionsMenu.classList.remove('active');
    });
});

function handleMoreOptionsAction(action) {
    switch(action) {
        case 'View Contact':
            // Handle view contact
            break;
        case 'Mute Notifications':
            // Handle mute notifications
            break;
        case 'Search Messages':
            // Handle search messages
            break;
        case 'Clear Chat':
            // Handle clear chat
            break;
        case 'Block Contact':
            // Handle block contact
            break;
    }
}

// Authentication Event Listener
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        showChatInterface();
        initializeUserData();
        setupRealtimeListeners();
    } else {
        showAuthInterface();
    }
});

// Authentication Functions
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target[0].value;
    const password = e.target[1].value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert(error.message);
    }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target[0].value;
    const email = e.target[1].value;
    const password = e.target[2].value;
    const mobile = e.target[3].value;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCredential.user.uid).set({
            name,
            email,
            mobile,
            status: 'offline',
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        alert(error.message);
    }
});

// Auth Tabs Toggle
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetForm = tab.dataset.tab === 'login' ? loginForm : signupForm;
        const otherForm = tab.dataset.tab === 'login' ? signupForm : loginForm;
        
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        targetForm.classList.remove('hidden');
        otherForm.classList.add('hidden');
    });
});

// Chat Interface Functions
async function initializeUserData() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data();
    
    document.querySelector('.user-name').textContent = userData.name;
    updateUserStatus('online');
    loadAllUsers(); // Changed from loadChats() to loadAllUsers()
}

async function loadAllUsers() {
    const usersSnapshot = await db.collection('users').get();
    
    chatList.innerHTML = '';
    usersSnapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) { // Don't show current user in the list
            createUserListItem(doc.id, doc.data());
        }
    });
}

function createUserListItem(userId, userData) {
    const userItem = document.createElement('div');
    userItem.className = 'chat-item';
    userItem.innerHTML = `
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random" alt="Profile" class="profile-pic">
        <div class="chat-item-info">
            <div class="chat-item-name">${userData.name}</div>
            <div class="chat-item-status">${userData.status || 'offline'}</div>
        </div>
    `;
    
    userItem.addEventListener('click', () => startNewChat(userId, userData));
    chatList.appendChild(userItem);
}

async function startNewChat(userId, userData) {
    // Check if chat already exists
    const chatsSnapshot = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    let existingChatId = null;
    
    chatsSnapshot.forEach(doc => {
        const chatData = doc.data();
        if (chatData.participants.includes(userId)) {
            existingChatId = doc.id;
        }
    });
    
    if (existingChatId) {
        // If chat exists, open it
        openChat(existingChatId, userData);
    } else {
        // If chat doesn't exist, create new one
        const newChatRef = await db.collection('chats').add({
            participants: [currentUser.uid, userId],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        openChat(newChatRef.id, userData);
    }
}

async function loadChats() {
    const chatsSnapshot = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    chatList.innerHTML = '';
    chatsSnapshot.forEach(doc => {
        const chatData = doc.data();
        const otherUserId = chatData.participants.find(id => id !== currentUser.uid);
        createChatListItem(otherUserId, doc.id);
    });
}

async function createChatListItem(userId, chatId) {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.innerHTML = `
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random" alt="Profile" class="profile-pic">
        <div class="chat-item-info">
            <div class="chat-item-name">${userData.name}</div>
            <div class="chat-item-status">${userData.status}</div>
        </div>
    `;
    
    chatItem.addEventListener('click', () => openChat(chatId, userData));
    chatList.appendChild(chatItem);
}

// Modify openChat function
async function openChat(chatId, userData) {
    currentChat = chatId;
    document.querySelector('.contact-name').textContent = userData.name;
    document.querySelector('.user-status').textContent = userData.status;
    
    messagesContainer.innerHTML = '';
    setupMessageListener(chatId);
    setupTypingListener(chatId); // Add typing listener

    // On mobile, hide sidebar when opening chat
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('active');
    }
}

function setupMessageListener(chatId) {
    return db.collection('chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const messageData = { ...change.doc.data(), id: change.doc.id };
                    // Only display if not deleted for current user
                    if (!messageData.deletedFor?.includes(currentUser.uid)) {
                        displayMessage(messageData);
                    }
                }
                if (change.type === 'modified') {
                    const messageElement = document.querySelector(`[data-message-id="${change.doc.id}"]`);
                    if (messageElement) {
                        const messageData = change.doc.data();
                        const contentDiv = messageElement.querySelector('.message-content');
                        contentDiv.textContent = messageData.content;
                    }
                }
                if (change.type === 'removed') {
                    const messageElement = document.querySelector(`[data-message-id="${change.doc.id}"]`);
                    if (messageElement) {
                        messageElement.remove();
                    }
                }
            });
        });
}

// Enhanced Message Display
function displayMessage(messageData) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${messageData.senderId === currentUser.uid ? 'sent' : 'received'}`;
    messageElement.dataset.messageId = messageData.id;
    
    messageElement.innerHTML = `
        <div class="message-content">${messageData.content}</div>
        <div class="message-timestamp">${formatTimestamp(messageData.timestamp)}</div>
        <div class="message-actions">
            <button class="copy-btn" title="Copy"><i class="fas fa-copy"></i></button>
            ${messageData.senderId === currentUser.uid ? `
                <button class="edit-btn" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
                <div class="delete-options hidden">
                    <button class="delete-for-me">Delete for me</button>
                    <button class="delete-for-everyone">Delete for everyone</button>
                </div>
            ` : ''}
        </div>
    `;

    // Add message status
    const statusDiv = document.createElement('div');
    statusDiv.className = 'message-status';
    statusDiv.innerHTML = `
        <i class="fas fa-check${messageData.read ? '-double status-read' : ''} status-icon"></i>
    `;
    messageElement.appendChild(statusDiv);
    
    // Add reactions if any
    if (messageData.reactions && messageData.reactions.length > 0) {
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        messageData.reactions.forEach(reaction => {
            reactionsDiv.innerHTML += `<span class="reaction-btn">${reaction.reaction}</span>`;
        });
        messageElement.appendChild(reactionsDiv);
    }
    
    // Format message content
    const formattedContent = messageData.content
        .replace(/\*(.*?)\*/g, '<b>$1</b>')
        .replace(/_(.*?)_/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
    messageElement.querySelector('.message-content').innerHTML = formattedContent;

    // Add event listeners for message actions
    const copyBtn = messageElement.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => copyMessageText(messageData.content));

    if (messageData.senderId === currentUser.uid) {
        const editBtn = messageElement.querySelector('.edit-btn');
        const deleteBtn = messageElement.querySelector('.delete-btn');
        const deleteOptions = messageElement.querySelector('.delete-options');

        editBtn.addEventListener('click', () => editMessage(messageElement, messageData));
        deleteBtn.addEventListener('click', () => toggleDeleteOptions(deleteOptions));

        const deleteForMe = messageElement.querySelector('.delete-for-me');
        const deleteForEveryone = messageElement.querySelector('.delete-for-everyone');

        deleteForMe.addEventListener('click', () => deleteMessage(messageData.id, 'me'));
        deleteForEveryone.addEventListener('click', () => deleteMessage(messageData.id, 'everyone'));
    }

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function copyMessageText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Message copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

async function editMessage(messageElement, messageData) {
    const contentDiv = messageElement.querySelector('.message-content');
    const originalText = contentDiv.textContent;
    
    contentDiv.contentEditable = true;
    contentDiv.focus();
    
    // Save on Enter key or blur
    const saveEdit = async () => {
        contentDiv.contentEditable = false;
        const newText = contentDiv.textContent.trim();
        
        if (newText !== originalText) {
            try {
                await db.collection('chats').doc(currentChat)
                    .collection('messages').doc(messageData.id)
                    .update({
                        content: newText,
                        edited: true,
                        editedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                showToast('Message updated');
            } catch (error) {
                console.error('Error updating message:', error);
                contentDiv.textContent = originalText;
                showToast('Failed to update message');
            }
        }
    };

    contentDiv.addEventListener('blur', saveEdit);
    contentDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        }
        if (e.key === 'Escape') {
            contentDiv.textContent = originalText;
            contentDiv.contentEditable = false;
        }
    });
}

function toggleDeleteOptions(deleteOptions) {
    deleteOptions.classList.toggle('hidden');
}

async function deleteMessage(messageId, deleteType) {
    try {
        const messageRef = db.collection('chats').doc(currentChat)
            .collection('messages').doc(messageId);

        if (deleteType === 'everyone') {
            await messageRef.delete();
        } else {
            // For 'delete for me', we'll add the user's ID to a deletedFor array
            await messageRef.update({
                deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
        }
        showToast('Message deleted');
    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message');
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }, 100);
}

// Handle message input
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Enable input in the contenteditable div
messageInput.addEventListener('input', (e) => {
    // Trigger typing indicator
    if (!currentChat) return;
    
    db.collection('chats').doc(currentChat).update({
        [`typing.${currentUser.uid}`]: true
    });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        db.collection('chats').doc(currentChat).update({
            [`typing.${currentUser.uid}`]: false
        });
    }, 3000);
});

// Handle send button click
sendMessageBtn.addEventListener('click', sendMessage);

// Enhanced sendMessage function
async function sendMessage() {
    const messageContent = messageInput.textContent.trim();
    
    if (!messageContent || !currentChat) return;
    
    try {
        // Create message data
        const messageData = {
            content: messageContent,
            senderId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'text'
        };
        
        // Add message to Firestore
        await db.collection('chats').doc(currentChat)
            .collection('messages').add(messageData);
        
        // Clear input
        messageInput.textContent = '';
        
        // Reset input height
        messageInput.style.height = 'auto';
        
        // Clear typing indicator
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            db.collection('chats').doc(currentChat).update({
                [`typing.${currentUser.uid}`]: false
            });
        }
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Update button states
        updateSendButton();
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message');
    }
}

// Add function to update send button visibility
function updateSendButton() {
    const hasText = messageInput.textContent.trim().length > 0;
    const voiceButton = document.getElementById('voiceRecordBtn');
    const sendButton = document.getElementById('sendMessageBtn');
    
    if (hasText) {
        voiceButton.classList.add('hidden');
        sendButton.classList.remove('hidden');
    } else {
        voiceButton.classList.remove('hidden');
        sendButton.classList.add('hidden');
    }
}

// Add placeholder handling for the contenteditable div
messageInput.addEventListener('focus', function() {
    if (this.textContent.trim() === '') {
        this.textContent = '';
    }
});

messageInput.addEventListener('blur', function() {
    if (this.textContent.trim() === '') {
        this.setAttribute('placeholder', 'Message');
    }
});

// User Status Management
async function updateUserStatus(status) {
    if (!currentUser) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            status,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
        currentUserStatus = status;
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

// Theme Toggle
themeToggle.addEventListener('click', () => {
    document.body.setAttribute('data-theme',
        document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    );
    themeToggle.innerHTML = document.body.getAttribute('data-theme') === 'dark' 
        ? '<i class="fas fa-sun"></i>' 
        : '<i class="fas fa-moon"></i>';
});

// Settings Panel
settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('active');
    settingsPanel.classList.remove('hidden');
});

closeSettings.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
    setTimeout(() => settingsPanel.classList.add('hidden'), 300);
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await updateUserStatus('offline');
        await auth.signOut();
    } catch (error) {
        alert('Error logging out: ' + error.message);
    }
});

// Utility Functions
// Modify showChatInterface function
function showChatInterface() {
    authContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // On mobile, show chat list immediately after login
    if (window.innerWidth <= 768) {
        sidebar.classList.add('active');
    }
}

function showAuthInterface() {
    authContainer.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    currentUser = null;
    currentChat = null;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// File Upload Handling
const attachmentBtn = document.getElementById('attachmentBtn');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*,.pdf,.doc,.docx';

attachmentBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const storageRef = storage.ref(`chat-files/${currentChat}/${file.name}`);
        const uploadTask = storageRef.put(file);
        
        uploadTask.on('state_changed',
            null,
            (error) => alert('Error uploading file: ' + error.message),
            async () => {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                const messageData = {
                    content: `[File] ${file.name}`,
                    fileURL: downloadURL,
                    fileType: file.type,
                    senderId: currentUser.uid,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('chats').doc(currentChat)
                    .collection('messages').add(messageData);
            }
        );
    } catch (error) {
        alert('Error processing file: ' + error.message);
    }
});

// Voice Recording
const voiceRecordBtn = document.getElementById('voiceRecordBtn');
let mediaRecorder = null;
let audioChunks = [];

voiceRecordBtn.addEventListener('mousedown', startRecording);
voiceRecordBtn.addEventListener('mouseup', stopRecording);

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };
        
        mediaRecorder.start();
        voiceRecordBtn.classList.add('recording');
    } catch (error) {
        alert('Error accessing microphone: ' + error.message);
    }
}

async function stopRecording() {
    if (!mediaRecorder) return;
    
    mediaRecorder.stop();
    voiceRecordBtn.classList.remove('recording');
    
    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        
        try {
            const storageRef = storage.ref(`voice-messages/${currentChat}/${Date.now()}.webm`);
            const uploadTask = storageRef.put(audioBlob);
            
            uploadTask.on('state_changed',
                null,
                (error) => alert('Error uploading voice message: ' + error.message),
                async () => {
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    const messageData = {
                        content: '[Voice Message]',
                        audioURL: downloadURL,
                        senderId: currentUser.uid,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    await db.collection('chats').doc(currentChat)
                        .collection('messages').add(messageData);
                }
            );
        } catch (error) {
            alert('Error processing voice message: ' + error.message);
        }
    };
}

// Initialize notification permissions
if ('Notification' in window) {
    Notification.requestPermission();
}

// Setup real-time listeners for user presence
function setupRealtimeListeners() {
    // Listen for user status changes
    db.collection('users').where('status', '==', 'online')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                const userData = change.doc.data();
                updateUserStatusUI(change.doc.id, userData.status);
            });
        });
}

function updateUserStatusUI(userId, status) {
    const statusElement = document.querySelector(`[data-user-id="${userId}"] .chat-item-status`);
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = `chat-item-status ${status}`;
    }
}

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
    updateUserStatus(document.hidden ? 'away' : 'online');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    updateUserStatus('offline');
});

// Mobile Navigation
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.querySelector('.sidebar');

// Modify menuBtn click handler
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('active');
});

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('active') &&
        !sidebar.contains(e.target) &&
        e.target !== menuBtn) {
        sidebar.classList.remove('active');
    }
});

// Add back button functionality for mobile
document.querySelector('.chat-header').addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && !e.target.closest('.menu-btn')) {
        sidebar.classList.add('active');
    }
});

// Close sidebar when clicking on chat area (mobile only)
chatContainer.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        !e.target.closest('.sidebar') && 
        !e.target.closest('.menu-btn')) {
        sidebar.classList.remove('active');
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        sidebar.classList.remove('active');
    } else if (!currentChat) {
        // Show sidebar by default on mobile if no chat is selected
        sidebar.classList.add('active');
    }
});

// Improve touch events for mobile
let touchStartY = 0;
let touchEndY = 0;

messagesContainer.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
});

messagesContainer.addEventListener('touchmove', (e) => {
    touchEndY = e.touches[0].clientY;
    const scrollTop = messagesContainer.scrollTop;
});
messagesContainer.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
});

messagesContainer.addEventListener('touchmove', (e) => {
    touchEndY = e.touches[0].clientY;
    const scrollTop = messagesContainer.scrollTop;
    const scrollHeight = messagesContainer.scrollHeight;
    const clientHeight = messagesContainer.clientHeight;

    // Prevent pull-to-refresh when at the top of messages
    if (scrollTop <= 0 && touchEndY > touchStartY) {
        e.preventDefault();
    }
    // Prevent overscroll at the bottom
    if (scrollTop + clientHeight >= scrollHeight && touchEndY < touchStartY) {
        e.preventDefault();
    }
}, { passive: false });

// Message Reactions
function addMessageReaction(messageId, reaction) {
    if (!currentChat || !messageId) return;
    
    db.collection('chats').doc(currentChat)
        .collection('messages').doc(messageId)
        .update({
            reactions: firebase.firestore.FieldValue.arrayUnion({
                userId: currentUser.uid,
                reaction: reaction,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            })
        });
}

// Typing Indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!currentChat) return;
    
    db.collection('chats').doc(currentChat).update({
        [`typing.${currentUser.uid}`]: true
    });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        db.collection('chats').doc(currentChat).update({
            [`typing.${currentUser.uid}`]: false
        });
    }, 3000);
});

// Story/Status Feature
async function createNewStatus() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const storageRef = storage.ref(`status/${currentUser.uid}/${Date.now()}`);
        const uploadTask = storageRef.put(file);
        
        uploadTask.on('state_changed',
            null,
            (error) => alert('Error uploading status: ' + error.message),
            async () => {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                await db.collection('status').add({
                    userId: currentUser.uid,
                    mediaUrl: downloadURL,
                    mediaType: file.type.includes('video') ? 'video' : 'image',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    viewers: [],
                    expires: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        );
    };
    
    input.click();
}

// Message Formatting
function formatText(type) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const text = range.toString();
    
    if (!text) return;
    
    let formattedText;
    switch(type) {
        case 'bold':
            formattedText = `*${text}*`;
            break;
        case 'italic':
            formattedText = `_${text}_`;
            break;
        case 'code':
            formattedText = `\`${text}\``;
            break;
    }
    
    const node = document.createTextNode(formattedText);
    range.deleteContents();
    range.insertNode(node);
}

// Real-time Typing Indicator
function setupTypingListener(chatId) {
    return db.collection('chats').doc(chatId)
        .onSnapshot(snapshot => {
            const data = snapshot.data();
            if (data?.typing) {
                const typingUsers = Object.entries(data.typing)
                    .filter(([uid, isTyping]) => uid !== currentUser.uid && isTyping);
                
                if (typingUsers.length > 0) {
                    document.getElementById('typingIndicator').classList.remove('hidden');
                } else {
                    document.getElementById('typingIndicator').classList.add('hidden');
                }
            }
        });
}

// Voice Messages Enhancement
function setupVoiceRecording() {
    // ...existing voice recording code...
    
    // Add visualizer
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function updateWaveform() {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        
        analyser.getByteTimeDomainData(dataArray);
        // Update waveform visualization
        requestAnimationFrame(updateWaveform);
    }
    
    // ...continue with existing voice recording code...
}

// Initialize enhanced features
function initializeEnhancedFeatures() {
    setupVoiceRecording();
    loadStatuses();
    setupEmojiPicker();
}

// Call initialization when app starts
document.addEventListener('DOMContentLoaded', initializeEnhancedFeatures);

// Mobile Quick Actions
document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const action = e.currentTarget.textContent.trim();
        switch(action) {
            case 'Photos':
                openGallery();
                break;
            case 'Camera':
                openCamera();
                break;
            case 'Documents':
                openDocuments();
                break;
            case 'Location':
                shareLocation();
                break;
            case 'Contact':
                shareContact();
                break;
        }
    });
});

function openGallery() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.click();
    
    input.onchange = (e) => handleMediaUpload(e.target.files);
}

function openCamera() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'camera';
    input.click();
    
    input.onchange = (e) => handleMediaUpload(e.target.files);
}

function openDocuments() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt';
    input.click();
    
    input.onchange = (e) => handleFileUpload(e.target.files[0]);
}

async function shareLocation() {
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        
        const messageData = {
            type: 'location',
            content: '📍 Shared a location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            senderId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('chats').doc(currentChat)
            .collection('messages').add(messageData);
    } catch (error) {
        showToast('Error sharing location');
    }
}

// Enhanced Voice Recording
let recordingTimer = null;
let recordingStartTime = null;

function updateRecordingTime() {
    if (!recordingStartTime) return;
    
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    document.querySelector('.recording-time').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

voiceRecordBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startRecording();
    document.querySelector('.recording-ui').classList.remove('hidden');
    recordingStartTime = Date.now();
    recordingTimer = setInterval(updateRecordingTime, 1000);
});

document.querySelector('.cancel-recording').addEventListener('click', () => {
    stopRecording(true);
    document.querySelector('.recording-ui').classList.add('hidden');
    clearInterval(recordingTimer);
});

document.querySelector('.send-recording').addEventListener('click', () => {
    stopRecording();
    document.querySelector('.recording-ui').classList.add('hidden');
    clearInterval(recordingTimer);
});

// Improve message input on mobile
messageInput.addEventListener('input', () => {
    // Adjust input height based on content
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 80) + 'px';
});

// Handle attachment button on mobile
attachmentBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const quickActions = document.querySelector('.quick-actions');
    quickActions.style.display = 
        quickActions.style.display === 'none' ? 'flex' : 'none';
});

// Add missing handleMediaUpload function
async function handleMediaUpload(files) {
    if (!files || !files.length) return;
    
    for (const file of files) {
        try {
            const storageRef = storage.ref(`chat-media/${currentChat}/${Date.now()}_${file.name}`);
            const uploadTask = storageRef.put(file);
            
            uploadTask.on('state_changed',
                null,
                (error) => showToast('Error uploading media: ' + error.message),
                async () => {
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    const messageData = {
                        type: 'media',
                        content: file.type.startsWith('image/') ? '📷 Image' : '📹 Video',
                        mediaUrl: downloadURL,
                        mediaType: file.type,
                        senderId: currentUser.uid,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    await db.collection('chats').doc(currentChat)
                        .collection('messages').add(messageData);
                }
            );
        } catch (error) {
            showToast('Error processing media: ' + error.message);
        }
    }
}

// Add missing handleFileUpload function
async function handleFileUpload(file) {
    if (!file) return;
    
    try {
        const storageRef = storage.ref(`chat-files/${currentChat}/${Date.now()}_${file.name}`);
        const uploadTask = storageRef.put(file);
        
        uploadTask.on('state_changed',
            null,
            (error) => showToast('Error uploading file: ' + error.message),
            async () => {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                const messageData = {
                    type: 'file',
                    content: `📎 ${file.name}`,
                    fileUrl: downloadURL,
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    senderId: currentUser.uid,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('chats').doc(currentChat)
                    .collection('messages').add(messageData);
            }
        );
    } catch (error) {
        showToast('Error processing file: ' + error.message);
    }
}

// Add missing shareContact function
async function shareContact() {
    // Create a temporary input for contact selection
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vcf,.vcard';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const messageData = {
                type: 'contact',
                content: '👤 Shared a contact',
                contactData: text,
                senderId: currentUser.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('chats').doc(currentChat)
                .collection('messages').add(messageData);
        } catch (error) {
            showToast('Error sharing contact');
        }
    };
    
    input.click();
}

// Add missing loadStatuses function
async function loadStatuses() {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const statusesSnapshot = await db.collection('status')
        .where('timestamp', '>', twentyFourHoursAgo)
        .orderBy('timestamp', 'desc')
        .get();
    
    const statusList = document.getElementById('statusList');
    statusesSnapshot.forEach(doc => {
        const statusData = doc.data();
        if (statusData.userId !== currentUser.uid) {
            const statusItem = createStatusItem(statusData);
            statusList.appendChild(statusItem);
        }
    });
}

// Add missing setupEmojiPicker function
function setupEmojiPicker() {
    const emojiBtn = document.getElementById('emojiBtn');
    if (!emojiBtn) return;
    
    emojiBtn.addEventListener('click', () => {
        // Simple emoji list for demonstration
        const emojis = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '😎', '🤔'];
        
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        picker.style.position = 'absolute';
        picker.style.bottom = '100%';
        picker.style.left = '0';
        picker.style.background = 'var(--sidebar-light)';
        picker.style.padding = '8px';
        picker.style.borderRadius = '8px';
        picker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        picker.style.display = 'grid';
        picker.style.gridTemplateColumns = 'repeat(4, 1fr)';
        picker.style.gap = '8px';
        
        emojis.forEach(emoji => {
            const button = document.createElement('button');
            button.textContent = emoji;
            button.style.fontSize = '20px';
            button.style.border = 'none';
            button.style.background = 'none';
            button.style.cursor = 'pointer';
            button.onclick = () => {
                messageInput.textContent += emoji;
                picker.remove();
            };
            picker.appendChild(button);
        });
        
        emojiBtn.parentElement.appendChild(picker);
        
        // Close picker when clicking outside
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target) && e.target !== emojiBtn) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    });
}

// Enhanced Chat Input Handlers
const sendBtn = document.getElementById('sendMessageBtn');
const voiceBtn = document.getElementById('voiceRecordBtn');
const attachBtn = document.getElementById('attachmentBtn');
const quickActions = document.querySelector('.quick-actions');

// Toggle send/voice button based on input
messageInput.addEventListener('input', () => {
    const hasText = messageInput.textContent.trim().length > 0;
    sendBtn.classList.toggle('hidden', !hasText);
    voiceBtn.classList.toggle('hidden', hasText);
});

// Handle attachment button
attachBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    quickActions.classList.toggle('active');
});

// Close quick actions when clicking outside
document.addEventListener('click', (e) => {
    if (!quickActions.contains(e.target) && e.target !== attachBtn) {
        quickActions.classList.remove('active');
    }
});

// Long press for voice recording
let recordingTimeout;
let isRecording = false;

voiceBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    recordingTimeout = setTimeout(() => {
        startRecording();
        isRecording = true;
        voiceBtn.classList.add('recording');
    }, 500);
});

voiceBtn.addEventListener('touchend', () => {
    if (isRecording) {
        stopRecording();
        voiceBtn.classList.remove('recording');
        isRecording = false;
    }
    clearTimeout(recordingTimeout);
});

// Prevent scroll when recording
voiceBtn.addEventListener('touchmove', (e) => {
    if (isRecording) {
        e.preventDefault();
    }
});

// Handle input paste events
messageInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
});

// Auto-resize input
const resizeInput = () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
};

messageInput.addEventListener('input', resizeInput);

// Override default Enter behavior
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (messageInput.textContent.trim()) {
            sendMessage();
        }
    }
});

// Make sure all DOM elements exist before adding event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements with null checks
    const emojiBtn = document.getElementById('emojiBtn');
    const voiceBtn = document.getElementById('voiceRecordBtn');
    const attachBtn = document.getElementById('attachmentBtn');
    const quickActions = document.querySelector('.quick-actions');
    const recordingUI = document.querySelector('.recording-ui');
    const cancelRecordingBtn = document.querySelector('.cancel-recording');
    const sendRecordingBtn = document.querySelector('.send-recording');

    // Voice Recording Setup
    if (voiceBtn) {
        let recordingTimeout;
        let isRecording = false;

        voiceBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            recordingTimeout = setTimeout(() => {
                startRecording();
                isRecording = true;
                voiceBtn.classList.add('recording');
                if (recordingUI) {
                    recordingUI.classList.remove('hidden');
                }
            }, 500);
        });

        voiceBtn.addEventListener('touchend', () => {
            if (isRecording) {
                stopRecording();
                voiceBtn.classList.remove('recording');
                isRecording = false;
                if (recordingUI) {
                    recordingUI.classList.add('hidden');
                }
            }
            clearTimeout(recordingTimeout);
        });
    }

    // Cancel and Send Recording Buttons
    if (cancelRecordingBtn) {
        cancelRecordingBtn.addEventListener('click', () => {
            stopRecording(true);
            if (recordingUI) {
                recordingUI.classList.add('hidden');
            }
            clearInterval(recordingTimer);
        });
    }

    if (sendRecordingBtn) {
        sendRecordingBtn.addEventListener('click', () => {
            stopRecording();
            if (recordingUI) {
                recordingUI.classList.add('hidden');
            }
            clearInterval(recordingTimer);
        });
    }

    // Attachment Button
    if (attachBtn && quickActions) {
        attachBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            quickActions.classList.toggle('active');
        });

        // Close quick actions when clicking outside
        document.addEventListener('click', (e) => {
            if (!quickActions.contains(e.target) && e.target !== attachBtn) {
                quickActions.classList.remove('active');
            }
        });
    }

    // Quick Action Buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.textContent.trim();
                handleQuickAction(action);
            });
        }
    });

    // Initialize Enhanced Features
    initializeEnhancedFeatures();
});

// Helper function to handle quick actions
function handleQuickAction(action) {
    switch(action) {
        case 'Photos & Videos':
        case 'Photos':
            openGallery();
            break;
        case 'Camera':
            openCamera();
            break;
        case 'Document':
        case 'Documents':
            openDocuments();
            break;
        case 'Location':
            shareLocation();
            break;
        case 'Contact':
            shareContact();
            break;
        case 'Poll':
            createPoll();
            break;
    }
}

// Add createPoll function
function createPoll() {
    showToast('Poll feature coming soon');
}

// Update initializeEnhancedFeatures function
function initializeEnhancedFeatures() {
    try {
        setupVoiceRecording();
        if (typeof loadStatuses === 'function') {
            loadStatuses();
        }
        if (typeof setupEmojiPicker === 'function') {
            setupEmojiPicker();
        }
    } catch (error) {
        console.error('Error initializing features:', error);
    }
}