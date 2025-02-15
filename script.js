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

// Message Sending
sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    if (!messageInput.value.trim() || !currentChat) return;
    
    const messageData = {
        content: messageInput.value,
        senderId: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('chats').doc(currentChat)
            .collection('messages').add(messageData);
        messageInput.value = '';
    } catch (error) {
        alert('Error sending message: ' + error.message);
    }
}

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

// Mobile Navigation Handlers
const mobileChatsBtn = document.getElementById('mobileChatsBtn');
const mobileStatusBtn = document.getElementById('mobileStatusBtn');
const mobileCameraBtn = document.getElementById('mobileCameraBtn');
const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');

function setActiveBottomTab(activeButton) {
    [mobileChatsBtn, mobileStatusBtn, mobileCameraBtn, mobileSettingsBtn].forEach(btn => {
        btn.classList.remove('active');
    });
    activeButton.classList.add('active');
}

mobileChatsBtn.addEventListener('click', () => {
    setActiveBottomTab(mobileChatsBtn);
    sidebar.classList.add('active');
    settingsPanel.classList.remove('active');
    settingsPanel.classList.add('hidden');
});

mobileStatusBtn.addEventListener('click', () => {
    setActiveBottomTab(mobileStatusBtn);
    // Implement status view
});

mobileCameraBtn.addEventListener('click', () => {
    setActiveBottomTab(mobileCameraBtn);
    // Open camera functionality
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.capture = 'camera';
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Handle captured media
            createNewStatus(file);
        }
    };
});

mobileSettingsBtn.addEventListener('click', () => {
    setActiveBottomTab(mobileSettingsBtn);
    settingsPanel.classList.remove('hidden');
    setTimeout(() => settingsPanel.classList.add('active'), 50);
});

// Enhanced Settings Panel
const darkModeToggle = document.getElementById('darkModeToggle');

darkModeToggle.addEventListener('change', () => {
    document.body.setAttribute('data-theme', darkModeToggle.checked ? 'dark' : 'light');
});

// Update settings visibility handler
function updateSettingsVisibility(show) {
    if (show) {
        settingsPanel.classList.remove('hidden');
        setTimeout(() => settingsPanel.classList.add('active'), 50);
    } else {
        settingsPanel.classList.remove('active');
        setTimeout(() => settingsPanel.classList.add('hidden'), 300);
    }
}

// Update existing settings button handler
settingsBtn.addEventListener('click', () => {
    updateSettingsVisibility(true);
});

closeSettings.addEventListener('click', () => {
    updateSettingsVisibility(false);
});

// Close settings panel when clicking outside
document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && 
        !settingsBtn.contains(e.target) && 
        !mobileSettingsBtn.contains(e.target)) {
        updateSettingsVisibility(false);
    }
});