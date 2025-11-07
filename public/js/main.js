    let currentUser = null;
    let currentContact = null;
    let contacts = [];
    let pendingMessage = '';
    let userDID = null;
    let lastSeenMessageIds = new Set(); // Track message IDs we've already seen
    let pollingInterval = null;
    let currentContactsTab = 'contacts'; // Track which tab is active in contacts modal

    // Toast notification system
    function showToast(message, type = 'success', duration = 4000) {
      const container = document.getElementById('toastContainer');

      const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
      };

      const titles = {
        success: 'Success',
        info: 'Info'
      };

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
          <div class="toast-title">${titles[type]}</div>
          <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        <div class="toast-progress"></div>
      `;

      container.appendChild(toast);

      // Hover-to-pause functionality
      let timeoutId;
      let startTime = Date.now();
      let remainingTime = duration;
      const progressBar = toast.querySelector('.toast-progress');

      // Initial auto-dismiss timeout
      timeoutId = setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
      }, duration);

      // Pause on hover
      toast.addEventListener('mouseenter', () => {
        clearTimeout(timeoutId);
        remainingTime -= (Date.now() - startTime);
        if (progressBar) {
          progressBar.style.animationPlayState = 'paused';
        }
      });

      // Resume on mouse leave
      toast.addEventListener('mouseleave', () => {
        startTime = Date.now();
        timeoutId = setTimeout(() => {
          toast.classList.add('hiding');
          setTimeout(() => toast.remove(), 300);
        }, remainingTime);
        if (progressBar) {
          progressBar.style.animationPlayState = 'running';
        }
      });
    }

    // Check authentication
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();

        if (!data.authenticated) {
          window.location.href = '/login.html';
          return false;
        }

        currentUser = data;

        // Load DID number
        const didResponse = await fetch('/api/config/did');
        const didData = await didResponse.json();

        if (didData.success && didData.did) {
          userDID = didData.did;

          // Format DID for display: 1 (780) 482 5026
          const formatDID = (did) => {
            // Remove all non-digits
            const digits = did.replace(/\D/g, '');
            // Format as: 1 (XXX) XXX XXXX
            if (digits.length === 11 && digits[0] === '1') {
              return `1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)} ${digits.slice(7)}`;
            } else if (digits.length === 10) {
              return `1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6)}`;
            }
            return did; // Return as-is if format doesn't match
          };

          const userNameEl = document.getElementById('userName');
          userNameEl.textContent = formatDID(userDID);
          userNameEl.title = 'Click to copy';

          // Add click-to-copy functionality - copy digits only
          userNameEl.addEventListener('click', async () => {
            try {
              const digitsOnly = userDID.replace(/\D/g, '');
              await navigator.clipboard.writeText(digitsOnly);
              showToast(`Copied ${digitsOnly} to clipboard!`, 'success');
            } catch (error) {
              console.error('Failed to copy:', error);
              showToast('Failed to copy to clipboard', 'info');
            }
          });
        }

        document.getElementById('userAvatar').textContent = data.username.charAt(0).toUpperCase();
        return true;
      } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return false;
      }
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
      } catch (error) {
        console.error('Logout failed:', error);
      }
    });

    // Load conversations
    async function loadConversations() {
      try {
        // Never show spam in conversations list
        const response = await fetch('/api/messages');
        const data = await response.json();

        if (data.success && data.conversations) {
          contacts = data.conversations;
          renderConversations(contacts);
        } else {
          document.getElementById('conversationsList').innerHTML = `
            <div class="empty-state">
              <div class="empty-state-text">No conversations yet</div>
              <div class="empty-state-subtext">Click "New" to start messaging</div>
            </div>
          `;
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
        document.getElementById('conversationsList').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-text">Failed to load</div>
          </div>
        `;
      }
    }

    // Render conversations list
    function renderConversations(contactsList) {
      const container = document.getElementById('conversationsList');

      if (contactsList.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-text">No conversations yet</div>
            <div class="empty-state-subtext">Click "New" to start messaging</div>
          </div>
        `;
        return;
      }

      container.innerHTML = contactsList.map(conv => {
        const time = conv.created_at ? new Date(conv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const preview = conv.content ? (conv.content.length > 40 ? conv.content.substring(0, 40) + '...' : conv.content) : 'No messages yet';
        const name = conv.contact_name || conv.name || conv.phone_number;

        return `
          <div class="conversation-item ${currentContact && currentContact.id === conv.contact_id ? 'active' : ''}"
               data-contact-id="${conv.contact_id}"
               onclick="selectContact('${conv.contact_id}')">
            <div class="contact-avatar" style="background: ${conv.avatar_color}">
              ${name.charAt(0).toUpperCase()}
            </div>
            <div class="conversation-details">
              <div class="conversation-header">
                <span class="contact-name">${escapeHtml(name)}</span>
                ${time ? `<span class="message-time">${time}</span>` : ''}
              </div>
              <div class="last-message">${escapeHtml(preview)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Select contact and load messages
    window.selectContact = async function(contactId) {
      let conv = contacts.find(c => c.contact_id === contactId);

      // If contact not in conversations (new conversation), fetch from contacts API
      if (!conv) {
        try {
          const response = await fetch('/api/contacts');
          const data = await response.json();

          if (data.success && data.contacts) {
            const contact = data.contacts.find(c => c.id === contactId);
            if (contact) {
              conv = {
                contact_id: contact.id,
                contact_name: contact.name,
                name: contact.name,
                phone_number: contact.phone_number,
                avatar_color: contact.avatar_color
              };
            }
          }
        } catch (error) {
          console.error('Failed to fetch contact:', error);
          return;
        }

        if (!conv) return; // Still not found
      }

      currentContact = {
        id: conv.contact_id,
        name: conv.contact_name || conv.name,
        phone_number: conv.phone_number,
        avatar_color: conv.avatar_color
      };
      renderConversations(contacts); // Update active state
      await loadMessages(contactId);
    };

    // Load messages for a contact
    async function loadMessages(contactId) {
      const chatArea = document.getElementById('chatArea');

      chatArea.innerHTML = `
        <div class="chat-header">
          <div class="chat-header-left">
            <div class="contact-avatar" style="background: ${currentContact.avatar_color}; width: 46px; height: 46px; font-size: 18px;">
              ${currentContact.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="chat-header-name" style="display: flex; align-items: center; gap: 8px;">
                ${escapeHtml(currentContact.name)}
                <svg onclick="openEditContactModal('${currentContact.id}', true)" style="width: 16px; height: 16px; cursor: pointer; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </div>
              <div class="chat-header-phone" onclick="openDialerWithNumber('${escapeHtml(currentContact.phone_number)}')" title="Click to call">${escapeHtml(currentContact.phone_number)}</div>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="delete-conversation-btn" onclick="toggleSpamFromChat()" title="Mark as Spam" style="background: rgba(255, 152, 0, 0.2); border-color: rgba(255, 152, 0, 0.4);">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
            </button>
            <button class="delete-conversation-btn" onclick="showDeleteModal()" title="Delete Conversation">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="messages-container" id="messagesContainer">
          <div class="loading">
            <div class="spinner"></div>
            Loading messages...
          </div>
        </div>
        <div class="message-input-area">
          <textarea class="message-input" id="messageInput" placeholder="Type a message..." rows="1"></textarea>
          <button class="note-btn" id="noteBtn" title="Add private note">
            <svg viewBox="0 0 24 24">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button class="send-btn" id="sendBtn">
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
            </svg>
          </button>
        </div>
      `;

      setupMessageHandlers();

      try {
        const response = await fetch(`/api/messages/conversation/${contactId}`);
        const data = await response.json();

        if (data.success && data.messages) {
          renderMessages(data.messages);

          // Mark all unread inbound messages as read
          markMessagesAsRead(data.messages);
        } else {
          document.getElementById('messagesContainer').innerHTML = `
            <div class="empty-state">
              <div class="empty-state-text">No messages yet</div>
              <div class="empty-state-subtext">Start the conversation!</div>
            </div>
          `;
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        document.getElementById('messagesContainer').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-text">Failed to load messages</div>
          </div>
        `;
      }
    }

    // Render messages
    function renderMessages(messages) {
      const container = document.getElementById('messagesContainer');

      if (messages.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-text">No messages yet</div>
            <div class="empty-state-subtext">Start the conversation!</div>
          </div>
        `;
        return;
      }

      container.innerHTML = messages.map(msg => {
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let label = '';

        // Handle different message types
        if (msg.direction === 'note') {
          label = 'Private Note • ';
        } else if (msg.direction === 'outbound') {
          label = 'Me • ';
        } else {
          // For inbound, show contact name or phone number
          const name = currentContact.name || currentContact.phone_number;
          label = `${name} • `;
        }

        const voicemailLink = msg.voicemail_blob_url
          ? `<div style="margin-top: 8px;"><a href="#" onclick="showVoicemailWarning('${escapeHtml(msg.voicemail_blob_url)}'); return false;" style="color: #667eea; text-decoration: none; font-size: 13px;">🎧 Listen to voicemail →</a></div>`
          : '';

        // Add subtle delete icon for private notes (next to timestamp)
        const deleteIcon = msg.direction === 'note'
          ? `<svg onclick="showDeleteNoteModal('${msg.id}')" style="width: 14px; height: 14px; margin-left: 8px; cursor: pointer; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
          : '';

        return `
          <div class="message ${msg.direction}">
            <div class="message-bubble">
              ${escapeHtml(msg.content)}
              ${voicemailLink}
            </div>
            <div class="message-timestamp" style="display: flex; align-items: center;">${label}${time}${deleteIcon}</div>
          </div>
        `;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    // Mark unread inbound messages as read
    async function markMessagesAsRead(messages) {
      // Find all unread inbound messages
      const unreadInbound = messages.filter(msg =>
        msg.direction === 'inbound' &&
        !msg.read_at &&
        msg.message_type !== 'note'
      );

      // Mark each as read
      for (const msg of unreadInbound) {
        try {
          await fetch(`/api/messages/${msg.id}/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error(`Failed to mark message ${msg.id} as read:`, error);
        }
      }
    }

    // Setup message input handlers
    function setupMessageHandlers() {
      const input = document.getElementById('messageInput');
      const sendBtn = document.getElementById('sendBtn');

      input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 140) + 'px';
      });

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // Enter just adds newline, no auto-send
          return;
        }
      });

      sendBtn.addEventListener('click', () => {
        const message = input.value.trim();
        if (message) {
          showSendModal(message);
        }
      });

      // Note button handler
      const noteBtn = document.getElementById('noteBtn');
      noteBtn.addEventListener('click', async () => {
        const message = input.value.trim();
        if (!message) return;
        if (!currentContact) {
          console.error('No current contact selected');
          return;
        }

        console.log('Saving note for contact:', currentContact);

        const noteBtn = document.getElementById('noteBtn');
        noteBtn.disabled = true;

        // Clear input immediately to prevent double-click duplicates
        input.value = '';
        input.style.height = 'auto';

        try {
          const noteData = {
            phoneNumber: currentContact.phone_number,
            body: message
          };
          console.log('Sending note data:', noteData);

          const response = await fetch('/api/messages/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noteData)
          });

          if (response.ok) {
            showToast('Note saved', 'info');
            await loadMessages(currentContact.id); // Refresh to show note
          } else {
            showToast('Failed to save note', 'error');
          }
        } catch (error) {
          console.error('Error saving note:', error);
          showToast('Error saving note', 'error');
        } finally {
          noteBtn.disabled = false;
        }
      });
    }

    // Show send confirmation modal
    function showSendModal(message) {
      pendingMessage = message;
      const preview = message.length > 100 ? message.substring(0, 100) + '...' : message;
      document.getElementById('sendConfirmText').textContent = `Send this message? "${preview}"`;
      document.getElementById('sendConfirmModal').classList.add('show');
    }

    // Close send modal
    window.closeSendModal = function() {
      document.getElementById('sendConfirmModal').classList.remove('show');
      pendingMessage = '';
    };

    // Confirm and send message
    window.confirmSend = async function() {
      const sendBtn = document.getElementById('sendBtn');
      const input = document.getElementById('messageInput');

      // Capture message before closing modal (which clears pendingMessage)
      const messageToSend = pendingMessage;

      closeSendModal();
      sendBtn.disabled = true;
      input.disabled = true;

      try {
        const response = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: currentContact.id,
            message: messageToSend
          })
        });

        const data = await response.json();

        if (data.success) {
          input.value = '';
          input.style.height = 'auto';
          await loadMessages(currentContact.id);
          showToast('Message sent successfully!', 'success');
        } else {
          showToast('Failed to send message: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        showToast('Failed to send message. Please try again.', 'info');
      } finally {
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
        pendingMessage = '';
      }
    };

    // Delete conversation modal functions
    let pendingDeleteContactId = null;

    window.showDeleteModal = function() {
      if (!currentContact) return;
      pendingDeleteContactId = currentContact.id;
      document.getElementById('deleteConfirmModal').classList.add('show');
    };

    window.closeDeleteModal = function() {
      document.getElementById('deleteConfirmModal').classList.remove('show');
      pendingDeleteContactId = null;
    };

    window.confirmDelete = async function() {
      if (!pendingDeleteContactId) return;

      const contactToDelete = pendingDeleteContactId;
      closeDeleteModal();

      try {
        const response = await fetch(`/api/messages/conversation/${contactToDelete}`, {
          method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
          showToast('Conversation deleted', 'success');
          currentContact = null;
          await loadConversations();

          // Show empty state
          document.getElementById('chatArea').innerHTML = `
            <div class="empty-state">
              <div class="empty-state-text">Select a conversation</div>
            </div>
          `;
        } else {
          showToast('Failed to delete conversation: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to delete conversation:', error);
        showToast('Failed to delete conversation. Please try again.', 'info');
      }

      pendingDeleteContactId = null;
    };

    // Voicemail warning modal functions
    let pendingVoicemailUrl = null;

    window.showVoicemailWarning = function(url) {
      pendingVoicemailUrl = url;
      document.getElementById('voicemailWarningModal').classList.add('show');
    };

    window.closeVoicemailWarning = function() {
      document.getElementById('voicemailWarningModal').classList.remove('show');
      pendingVoicemailUrl = null;
    };

    window.confirmPlayVoicemail = function() {
      if (pendingVoicemailUrl) {
        window.open(pendingVoicemailUrl, '_blank');
        closeVoicemailWarning();
      }
    };

    // New message button - show contacts modal
    document.getElementById('newMessageBtn').addEventListener('click', () => {
      showContactsModal();
    });

    // Contacts button - show manage contacts modal
    document.getElementById('contactsBtn').addEventListener('click', () => {
      showManageContactsModal();
    });

    // Show contacts modal
    async function showContactsModal() {
      const modal = document.getElementById('contactsModal');
      const contactList = document.getElementById('contactList');

      contactList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading contacts...</div>';
      modal.classList.add('show');

      try {
        const response = await fetch('/api/contacts');
        const data = await response.json();

        if (data.success && data.contacts) {
          // Filter out spam contacts
          const nonSpamContacts = data.contacts.filter(c => !c.is_spam || c.is_spam === false);
          renderContactList(nonSpamContacts);
        } else {
          contactList.innerHTML = '<div class="empty-state"><div class="empty-state-text">No contacts found</div></div>';
        }
      } catch (error) {
        console.error('Failed to load contacts:', error);
        contactList.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load contacts</div></div>';
      }
    }

    // Render contact list in modal
    function renderContactList(contactsList) {
      const contactList = document.getElementById('contactList');

      if (contactsList.length === 0) {
        contactList.innerHTML = '<div class="empty-state"><div class="empty-state-text">No contacts found</div></div>';
        return;
      }

      contactList.innerHTML = contactsList.map(contact => `
        <div class="contact-list-item" onclick="selectContactFromModal('${contact.id}')">
          <div class="contact-list-item-avatar" style="background: ${contact.avatar_color}">
            ${contact.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="contact-list-item-name">${escapeHtml(contact.name)}</div>
            <div class="contact-list-item-phone">${escapeHtml(contact.phone_number)}</div>
          </div>
        </div>
      `).join('');
    }

    // Select contact from modal
    window.selectContactFromModal = function(contactId) {
      closeContactsModal();
      selectContact(contactId);
    };

    // Close contacts modal
    window.closeContactsModal = function() {
      document.getElementById('contactsModal').classList.remove('show');
    };

    // Open create contact modal
    window.openCreateContactModal = function() {
      document.getElementById('contactsModal').classList.remove('show');
      document.getElementById('createContactModal').classList.add('show');
    };

    // Close create contact modal
    window.closeCreateContactModal = function() {
      document.getElementById('createContactModal').classList.remove('show');
      document.getElementById('createContactForm').reset();
    };

    // Handle create contact form submission
    document.getElementById('createContactForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      const name = document.getElementById('contactName').value.trim();
      const phone = document.getElementById('contactPhone').value.trim();

      if (!name || !phone) {
        alert('Please fill in all fields');
        return;
      }

      try {
        const response = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            phone_number: phone
          })
        });

        const data = await response.json();

        if (data.success) {
          closeCreateContactModal();
          await loadConversations();
          showToast(`Contact "${name}" created successfully!`, 'success');
        } else {
          showToast('Failed to create contact: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to create contact:', error);
        showToast('Failed to create contact. Please try again.', 'info');
      }
    });

    // Search contacts in modal
    document.getElementById('contactSearch').addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      const filtered = contacts.filter(contact =>
        contact.name.toLowerCase().includes(query) ||
        contact.phone_number.includes(query)
      );
      renderContactList(filtered);
    });

    // Switch between contacts and spam tabs
    window.switchContactsTab = function(tab) {
      currentContactsTab = tab;

      // Update tab UI
      document.getElementById('contactsTab').classList.toggle('active', tab === 'contacts');
      document.getElementById('spamTab').classList.toggle('active', tab === 'spam');

      // Update button visibility - hide "Add Contact" button in spam tab
      const addContactBtn = document.getElementById('addContactBtn');
      if (tab === 'spam') {
        addContactBtn.style.display = 'none';
      } else {
        addContactBtn.style.display = '';
      }

      // Re-render the contact list based on current tab
      const filteredContacts = contacts.filter(c => {
        if (tab === 'spam') {
          return c.is_spam === true;
        } else {
          return !c.is_spam || c.is_spam === false;
        }
      });

      renderManageContactList(filteredContacts);
    };

    // Show manage contacts modal
    async function showManageContactsModal() {
      const modal = document.getElementById('manageContactsModal');
      const contactList = document.getElementById('manageContactList');

      // Reset to contacts tab when opening
      currentContactsTab = 'contacts';
      document.getElementById('contactsTab').classList.add('active');
      document.getElementById('spamTab').classList.remove('active');
      document.getElementById('addContactBtn').style.display = '';

      contactList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading contacts...</div>';
      modal.classList.add('show');

      try {
        const response = await fetch('/api/contacts');
        const data = await response.json();

        if (data.success && data.contacts) {
          contacts = data.contacts; // Store for search
          // Filter based on current tab (should be 'contacts' by default)
          const filteredContacts = data.contacts.filter(c => !c.is_spam || c.is_spam === false);
          renderManageContactList(filteredContacts);
        } else {
          contactList.innerHTML = '<div class="empty-state"><div class="empty-state-text">No contacts found</div></div>';
        }
      } catch (error) {
        console.error('Failed to load contacts:', error);
        contactList.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load contacts</div></div>';
      }
    }

    // Render contact list in manage contacts modal
    function renderManageContactList(contactsList) {
      const contactList = document.getElementById('manageContactList');

      if (contactsList.length === 0) {
        const emptyMessage = currentContactsTab === 'spam' ? 'No spam contacts' : 'No contacts found';
        contactList.innerHTML = `<div class="empty-state"><div class="empty-state-text">${emptyMessage}</div></div>`;
        return;
      }

      // Different rendering for spam tab vs contacts tab
      if (currentContactsTab === 'spam') {
        // Spam tab: Only show undo button (yellow)
        contactList.innerHTML = contactsList.map(contact => `
          <div class="contact-list-item">
            <div class="contact-list-item-avatar" style="background: ${contact.avatar_color}">
              ${contact.name.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
              <div class="contact-list-item-name">${escapeHtml(contact.name)}</div>
              <div class="contact-list-item-phone">${escapeHtml(contact.phone_number)}</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="icon-btn" onclick="showUnmarkSpamModal('${contact.id}', '${escapeHtml(contact.name)}')" title="Unmark as spam" style="padding: 8px; border: none; background: rgba(245, 158, 11, 0.2); color: #f59e0b; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; transition: all 0.2s;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7v6h6"></path>
                  <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path>
                </svg>
              </button>
            </div>
          </div>
        `).join('');
      } else {
        // Contacts tab: Show mark as spam, edit, and delete buttons
        contactList.innerHTML = contactsList.map(contact => `
          <div class="contact-list-item">
            <div class="contact-list-item-avatar" style="background: ${contact.avatar_color}">
              ${contact.name.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
              <div class="contact-list-item-name">${escapeHtml(contact.name)}</div>
              <div class="contact-list-item-phone">${escapeHtml(contact.phone_number)}</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="icon-btn" onclick="showMarkSpamModal('${contact.id}', '${escapeHtml(contact.name)}')" title="Mark as spam" style="padding: 8px; border: none; background: rgba(255, 152, 0, 0.2); color: #ff9800; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; transition: all 0.2s;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
              </button>
              <button class="icon-btn" onclick="openEditContactModal('${contact.id}')" title="Edit contact" style="padding: 8px; border: none; background: rgba(74, 144, 226, 0.2); color: #4A90E2; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; transition: all 0.2s;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="icon-btn" onclick="openDeleteContactModal('${contact.id}', '${escapeHtml(contact.name)}')" title="Delete contact" style="padding: 8px; border: none; background: rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; transition: all 0.2s;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    // Close manage contacts modal
    window.closeManageContactsModal = function() {
      document.getElementById('manageContactsModal').classList.remove('show');
      document.getElementById('manageContactSearch').value = '';
    };

    // Open create contact modal from manage contacts
    window.openCreateContactFromManage = function() {
      closeManageContactsModal();
      document.getElementById('createContactModal').classList.add('show');
    };

    // Edit contact functions
    let contactToEdit = null;

    // Track where edit modal was opened from
    let editContactOpenedFrom = 'contacts'; // 'contacts' or 'chat'

    window.openEditContactModal = async function(contactId, fromChat = false) {
      editContactOpenedFrom = fromChat ? 'chat' : 'contacts';

      try {
        const response = await fetch(`/api/contacts/${contactId}`);
        const data = await response.json();

        if (data.success && data.contact) {
          contactToEdit = data.contact;
          document.getElementById('editContactId').value = contactId;
          document.getElementById('editContactName').value = data.contact.name;
          document.getElementById('editContactPhone').value = data.contact.phone_number;
          document.getElementById('manageContactsModal').classList.remove('show');
          document.getElementById('editContactModal').classList.add('show');
        } else {
          showToast('Failed to load contact details', 'info');
        }
      } catch (error) {
        console.error('Failed to load contact:', error);
        showToast('Failed to load contact details', 'info');
      }
    };

    window.closeEditContactModal = function() {
      document.getElementById('editContactModal').classList.remove('show');
      document.getElementById('editContactForm').reset();
      contactToEdit = null;

      // Only reopen manage contacts modal if we came from there
      if (editContactOpenedFrom === 'contacts') {
        showManageContactsModal();
      }
      // If from chat, just close and stay in chat
    };

    document.getElementById('editContactForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      const contactId = document.getElementById('editContactId').value;
      const name = document.getElementById('editContactName').value.trim();
      const phone = document.getElementById('editContactPhone').value.trim();

      if (!name || !phone) {
        showToast('Please fill in all fields', 'info');
        return;
      }

      try {
        const response = await fetch(`/api/contacts/${contactId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone_number: phone }),
        });

        const data = await response.json();

        if (data.success) {
          // If editing from chat, update currentContact and reload messages
          if (editContactOpenedFrom === 'chat' && currentContact && currentContact.id === contactId) {
            currentContact.name = name;
            currentContact.phone_number = phone;
            await loadMessages(contactId); // Reload to update header
          }

          closeEditContactModal();
          await loadConversations();
          showToast(`Contact "${name}" updated successfully!`, 'success');
        } else {
          showToast('Failed to update contact: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to update contact:', error);
        showToast('Failed to update contact. Please try again.', 'info');
      }
    });

    // Delete contact functions
    let contactToDelete = null;

    window.openDeleteContactModal = function(contactId, contactName) {
      contactToDelete = contactId;
      // Close the manage contacts modal first to avoid z-index issues
      document.getElementById('manageContactsModal').classList.remove('show');
      document.getElementById('deleteContactConfirmText').textContent =
        `Are you sure you want to delete "${contactName}"? This will permanently delete this contact and cannot be undone.`;
      document.getElementById('deleteContactConfirmModal').classList.add('show');
    };

    window.closeDeleteContactModal = function() {
      document.getElementById('deleteContactConfirmModal').classList.remove('show');
      contactToDelete = null;
      // Reopen manage contacts modal when user cancels delete
      showManageContactsModal();
    };

    window.confirmDeleteContact = async function() {
      if (!contactToDelete) return;

      try {
        const response = await fetch(`/api/contacts/${contactToDelete}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (data.success) {
          closeDeleteContactModal();
          await showManageContactsModal(); // Refresh contact list
          await loadConversations(); // Refresh conversations
          showToast('Contact deleted successfully', 'success');
        } else {
          showToast('Failed to delete contact: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to delete contact:', error);
        showToast('Failed to delete contact. Please try again.', 'info');
      }
    };

    // Search contacts in manage modal
    document.getElementById('manageContactSearch').addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      const filtered = contacts.filter(contact => {
        // Filter by search query
        const matchesSearch = contact.name.toLowerCase().includes(query) ||
          contact.phone_number.includes(query);

        // Filter by current tab
        if (currentContactsTab === 'spam') {
          return matchesSearch && contact.is_spam === true;
        } else {
          return matchesSearch && (!contact.is_spam || contact.is_spam === false);
        }
      });
      renderManageContactList(filtered);
    });

    // Spam marking functions
    let pendingSpamContactId = null;
    let pendingSpamContactName = null;

    // Show mark spam modal
    window.showMarkSpamModal = function(contactId, contactName) {
      pendingSpamContactId = contactId;
      pendingSpamContactName = contactName;
      document.getElementById('markSpamText').textContent =
        `Mark "${contactName}" as spam? You will never see their messages, calls, or voicemails again.`;
      document.getElementById('markSpamModal').classList.add('show');
    };

    // Close mark spam modal
    window.closeMarkSpamModal = function() {
      document.getElementById('markSpamModal').classList.remove('show');
      pendingSpamContactId = null;
      pendingSpamContactName = null;
    };

    // Confirm mark as spam
    window.confirmMarkSpam = async function() {
      if (!pendingSpamContactId) return;

      const contactId = pendingSpamContactId;
      const contactName = pendingSpamContactName;
      const wasCurrentContact = currentContact && currentContact.id === contactId;
      closeMarkSpamModal();

      try {
        const response = await fetch(`/api/contacts/${contactId}/spam`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_spam: true }),
        });

        const data = await response.json();

        if (data.success) {
          // Reload all contacts
          const contactsResponse = await fetch('/api/contacts');
          const contactsData = await contactsResponse.json();

          if (contactsData.success && contactsData.contacts) {
            contacts = contactsData.contacts;

            // Re-render based on current tab (only if contacts modal is open)
            const filteredContacts = contacts.filter(c => {
              if (currentContactsTab === 'spam') {
                return c.is_spam === true;
              } else {
                return !c.is_spam || c.is_spam === false;
              }
            });

            // Only re-render if the manage contacts modal is open
            const modal = document.getElementById('manageContactsModal');
            if (modal.classList.contains('show')) {
              renderManageContactList(filteredContacts);
            }
          }

          await loadConversations(); // Refresh conversations

          // If this was the currently open chat, clear it
          if (wasCurrentContact) {
            const chatArea = document.getElementById('chatArea');
            chatArea.innerHTML = `
              <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <div class="empty-state-text">Select a conversation</div>
                <div class="empty-state-subtext">Choose a contact to start messaging</div>
              </div>
            `;
            currentContact = null;
          }

          showToast('Contact marked as spam and blocked', 'success');
        } else {
          showToast('Failed to mark as spam: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to mark as spam:', error);
        showToast('Failed to mark as spam. Please try again.', 'info');
      }
    };

    // Show unmark spam modal
    window.showUnmarkSpamModal = function(contactId, contactName) {
      pendingSpamContactId = contactId;
      pendingSpamContactName = contactName;
      document.getElementById('unmarkSpamText').textContent =
        `Unmark "${contactName}" as spam? This contact will be visible again and you'll receive their messages.`;
      document.getElementById('unmarkSpamModal').classList.add('show');
    };

    // Close unmark spam modal
    window.closeUnmarkSpamModal = function() {
      document.getElementById('unmarkSpamModal').classList.remove('show');
      pendingSpamContactId = null;
      pendingSpamContactName = null;
    };

    // Confirm unmark spam
    window.confirmUnmarkSpam = async function() {
      if (!pendingSpamContactId) return;

      const contactId = pendingSpamContactId;
      const contactName = pendingSpamContactName;
      closeUnmarkSpamModal();

      try {
        const response = await fetch(`/api/contacts/${contactId}/spam`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_spam: false }),
        });

        const data = await response.json();

        if (data.success) {
          // Reload all contacts
          const contactsResponse = await fetch('/api/contacts');
          const contactsData = await contactsResponse.json();

          if (contactsData.success && contactsData.contacts) {
            contacts = contactsData.contacts;

            // Re-render based on current tab
            const filteredContacts = contacts.filter(c => {
              if (currentContactsTab === 'spam') {
                return c.is_spam === true;
              } else {
                return !c.is_spam || c.is_spam === false;
              }
            });
            renderManageContactList(filteredContacts);
          }

          await loadConversations(); // Refresh conversations
          showToast('Contact unmarked as spam', 'success');
        } else {
          showToast('Failed to unmark spam: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to unmark spam:', error);
        showToast('Failed to unmark spam. Please try again.', 'info');
      }
    };

    window.toggleSpamFromChat = async function() {
      if (!currentContact) return;

      // Use the modal instead of confirm()
      showMarkSpamModal(currentContact.id, currentContact.name);
    };

    // Delete note functions
    let pendingDeleteNoteId = null;

    // Show delete note modal
    window.showDeleteNoteModal = function(noteId) {
      pendingDeleteNoteId = noteId;
      document.getElementById('deleteNoteModal').classList.add('show');
    };

    // Close delete note modal
    window.closeDeleteNoteModal = function() {
      document.getElementById('deleteNoteModal').classList.remove('show');
      pendingDeleteNoteId = null;
    };

    // Confirm delete note
    window.confirmDeleteNote = async function() {
      if (!pendingDeleteNoteId) return;

      const noteId = pendingDeleteNoteId;
      closeDeleteNoteModal();

      try {
        const response = await fetch(`/api/messages/${noteId}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (data.success) {
          showToast('Note deleted', 'success');
          // Refresh messages to remove the deleted note
          if (currentContact) {
            await loadMessages(currentContact.id);
          }
        } else {
          showToast('Failed to delete note: ' + (data.error || 'Unknown error'), 'info');
        }
      } catch (error) {
        console.error('Failed to delete note:', error);
        showToast('Failed to delete note. Please try again.', 'info');
      }
    };

    // Search conversations
    document.getElementById('searchBar').addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      const filtered = contacts.filter(contact =>
        contact.name.toLowerCase().includes(query) ||
        contact.phone_number.includes(query)
      );
      renderConversations(filtered);
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', function(e) {
        if (e.target === this) {
          this.classList.remove('show');
        }
      });
    });

    // Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Poll for new messages
    async function pollForNewMessages() {
      try {
        const response = await fetch('/api/messages');
        const data = await response.json();

        if (data.success && data.conversations) {
          const newMessages = [];

          // Check for messages we haven't seen before
          data.conversations.forEach(conv => {
            if (!lastSeenMessageIds.has(conv.message_id)) {
              // This is a new message
              newMessages.push(conv);
              lastSeenMessageIds.add(conv.message_id);
            }
          });

          // Show toast for new INBOUND messages only (not our own sent messages)
          newMessages.forEach(conv => {
            if (conv.direction === 'inbound') {
              const name = conv.contact_name || conv.phone_number;
              const preview = conv.content.length > 50 ? conv.content.substring(0, 50) + '...' : conv.content;
              showToast(`${name}: ${preview}`, 'info', 6000);
            }
          });

          // Update conversation list if we got new messages
          if (newMessages.length > 0) {
            contacts = data.conversations;
            renderConversations(contacts);

            // If viewing a conversation that got a new message, refresh it
            if (currentContact && newMessages.some(m => m.contact_id === currentContact.id)) {
              await loadMessages(currentContact.id);
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Don't show error toast, just log it
      }
    }

    // Start polling for new messages
    function startPolling() {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }

      // Poll every 5 seconds
      pollingInterval = setInterval(pollForNewMessages, 5000);
    }

    // Stop polling
    function stopPolling() {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }

    // Check for new voicemails
    async function checkVoicemails() {
      // Always show "Checking for voicemails..." on page load
      const container = document.getElementById('toastContainer');
      const loadingToast = document.createElement('div');
      loadingToast.className = 'toast info';
      loadingToast.innerHTML = `
        <div class="toast-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
            <path d="M12 2 A10 10 0 0 1 22 12" stroke-linecap="round">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="1s"
                repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
        <div class="toast-content">
          <div class="toast-title">Info</div>
          <div class="toast-message">Checking for voicemails...</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
      `;
      container.appendChild(loadingToast);

      try {
        const response = await fetch('/api/voicemail/sync');
        const data = await response.json();

        if (!data.success) {
          loadingToast.remove();
          return;
        }

        // Check if there are new voicemails
        if (data.newVoicemails && data.newVoicemails.length > 0) {
          // Update toast to show processing
          loadingToast.querySelector('.toast-message').textContent =
            `Processing ${data.newVoicemails.length} new voicemail${data.newVoicemails.length > 1 ? 's' : ''}...`;

          // Show success toasts after processing
          setTimeout(() => {
            loadingToast.remove();
            data.newVoicemails.forEach(vm => {
              showToast(`New voicemail from ${vm.from}`, 'success');
            });
          }, 1500);

          // Reload conversations to show new voicemails
          await loadConversations();
        } else {
          // No new voicemails - update toast and auto-dismiss
          loadingToast.querySelector('.toast-message').textContent = 'No voicemails in system';
          setTimeout(() => {
            loadingToast.remove();
          }, 2000);
        }

      } catch (error) {
        console.error('Failed to check voicemails:', error);
        loadingToast.remove();
        // Don't show error toast - this is a background operation
      }
    }

    // Initialize app
    async function init() {
      const authenticated = await checkAuth();
      if (authenticated) {
        await loadConversations();

        // Track all initial message IDs so we don't show toasts for them
        contacts.forEach(conv => {
          lastSeenMessageIds.add(conv.message_id);
        });

        // Check for new voicemails (non-blocking)
        checkVoicemails();

        // Start polling for new messages
        startPolling();
      }
    }

    // ============================================
    // PHONE DIALER - SIP.js Integration
    // ============================================

    let userAgent = null;
    let currentSession = null;
    let callStartTime = null;
    let sipServerConfig = null; // Store SIP server config for making calls

    // Toggle phone sidebar
    function togglePhone() {
      const sidebar = document.getElementById('phoneSidebar');
      const toggle = document.getElementById('phoneToggle');
      const isOpening = !sidebar.classList.contains('open');

      sidebar.classList.toggle('open');
      toggle.classList.toggle('open');

      // Populate contact selector when opening
      if (isOpening) {
        populateContactSelector();
      }
    }

    // Format phone number for display: (780) 226-5961
    function formatPhoneDisplay(phoneNumber) {
      // Strip all non-digit characters
      const digitsOnly = phoneNumber.replace(/\D/g, '');

      // Handle North American 10-digit numbers
      if (digitsOnly.length === 10) {
        return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
      }
      // Handle 11-digit numbers starting with 1
      else if (digitsOnly.length === 11 && digitsOnly[0] === '1') {
        return `(${digitsOnly.slice(1, 4)}) ${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
      }
      // Return as-is for other formats
      return phoneNumber;
    }

    // Open dialer with pre-populated number
    window.openDialerWithNumber = function(phoneNumber) {
      const sidebar = document.getElementById('phoneSidebar');
      const toggle = document.getElementById('phoneToggle');

      // Strip formatting and keep only digits
      const digitsOnly = phoneNumber.replace(/\D/g, '');

      // Open the dialer if not already open
      if (!sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        toggle.classList.add('open');
        populateContactSelector();
      }

      // Set the phone number with formatting
      document.getElementById('phoneDisplay').value = formatPhoneDisplay(digitsOnly);

      // Auto-select the contact in the dropdown if they exist
      const selector = document.getElementById('phoneContactSelector');
      const matchingContact = contacts.find(c => c.phone_number.replace(/\D/g, '') === digitsOnly);

      if (matchingContact) {
        selector.value = digitsOnly;
      } else {
        selector.value = '';
      }
    };

    // Populate contact selector dropdown
    function populateContactSelector() {
      const selector = document.getElementById('phoneContactSelector');

      // Clear existing options (except the first one)
      selector.innerHTML = '<option value="">Select a contact...</option>';

      // Add contacts from the conversations list (exclude spam contacts)
      contacts.forEach(contact => {
        // Skip spam contacts
        if (contact.is_spam) return;

        const option = document.createElement('option');
        const name = contact.contact_name || contact.name || contact.phone_number;
        const phone = contact.phone_number.replace(/\D/g, ''); // Strip formatting
        const formattedPhone = formatPhoneDisplay(phone);

        option.value = phone;
        option.textContent = name;
        selector.appendChild(option);
      });
    }

    // Handle contact selection from dropdown
    window.selectContactForCall = function() {
      const selector = document.getElementById('phoneContactSelector');
      const phoneNumber = selector.value;

      if (phoneNumber) {
        document.getElementById('phoneDisplay').value = formatPhoneDisplay(phoneNumber);
      }
    };

    // Dial a digit
    function dialDigit(digit) {
      const display = document.getElementById('phoneDisplay');

      // Send DTMF if in active call
      if (currentSession && currentSession.isEstablished()) {
        try {
          currentSession.sendDTMF(digit);
          console.log('[Phone] Sent DTMF:', digit);
        } catch (e) {
          console.error('[Phone] DTMF error:', e);
        }
        // During a call, just append without formatting
        display.value += digit;
      } else {
        // Before calling, add digit and reformat
        const currentDigits = display.value.replace(/\D/g, '');
        const newDigits = currentDigits + digit;
        display.value = formatPhoneDisplay(newDigits);
      }
    }

    // Clear display
    function clearDisplay() {
      document.getElementById('phoneDisplay').value = '';
    }

    // Update call status
    function updateCallStatus(message, statusClass = '') {
      const statusEl = document.getElementById('callStatus');
      statusEl.textContent = message;
      statusEl.className = 'call-status ' + statusClass;
    }

    // Initialize JsSIP User Agent
    async function initializeSIP(retryCount = 0) {
      const maxRetries = 5;

      console.log(`[Phone] Attempting to initialize SIP... (attempt ${retryCount + 1}/${maxRetries + 1})`);
      console.log('[Phone] JsSIP library status:', typeof JsSIP !== 'undefined' ? 'loaded' : 'NOT LOADED');

      try {
        // Check if JsSIP is loaded
        if (typeof JsSIP === 'undefined') {
          if (retryCount < maxRetries) {
            console.warn(`[Phone] JsSIP not ready yet, retrying in ${(retryCount + 1) * 200}ms...`);
            setTimeout(() => initializeSIP(retryCount + 1), (retryCount + 1) * 200);
            return;
          } else {
            console.error('[Phone] JsSIP library failed to load after multiple attempts');
            updateCallStatus('SIP library not available', 'error');
            return;
          }
        }

        console.log('[Phone] JsSIP loaded successfully, fetching SIP config...');

        // Fetch SIP configuration from server
        const sipConfigResponse = await fetch('/api/config/sip');
        if (!sipConfigResponse.ok) {
          throw new Error('Failed to fetch SIP configuration');
        }

        const sipConfigData = await sipConfigResponse.json();
        if (!sipConfigData.success) {
          throw new Error(sipConfigData.error || 'SIP configuration error');
        }

        const sipConfig = sipConfigData.config;
        sipServerConfig = sipConfig; // Store globally for making calls

        console.log('[Phone] SIP config loaded:', {
          server: sipConfig.server,
          port: sipConfig.port,
          user: sipConfig.user
        });

        const wsUrl = `wss://${sipConfig.server}:${sipConfig.port}`;
        const socket = new JsSIP.WebSocketInterface(wsUrl);

        const configuration = {
          sockets: [socket],
          uri: `sip:${sipConfig.user}@${sipConfig.server}`,
          authorization_user: sipConfig.user,
          password: sipConfig.password,
          display_name: sipConfig.displayName,
          session_timers: false,
          connection_recovery_min_interval: 2,
          connection_recovery_max_interval: 30
        };

        console.log('[Phone] Creating JsSIP User Agent with config:', {
          uri: configuration.uri,
          socket: wsUrl
        });

        userAgent = new JsSIP.UA(configuration);

        // Connection lifecycle events
        userAgent.on('connecting', (event) => {
          console.log('[Phone] 🔄 Connecting to VoIP.ms:', wsUrl);
          updateCallStatus('Connecting...', '');
        });

        userAgent.on('connected', (event) => {
          console.log('[Phone] ✅ WebSocket connected to:', wsUrl);
        });

        userAgent.on('disconnected', (event) => {
          console.warn('[Phone] ⚠️ WebSocket disconnected');
          console.warn('[Phone] Disconnect event:', event);
          updateCallStatus('Disconnected', 'error');
        });

        // Registration events
        userAgent.on('registered', (event) => {
          console.log('[Phone] ✅ SIP registered successfully');
          updateCallStatus('Ready to call', '');
        });

        userAgent.on('registrationFailed', (event) => {
          console.error('[Phone] ❌ SIP registration failed');
          console.error('[Phone] Cause:', event.cause);
          console.error('[Phone] Response:', event.response ? {
            status_code: event.response.status_code,
            reason_phrase: event.response.reason_phrase,
            headers: event.response.headers
          } : 'No response');
          updateCallStatus('Registration failed: ' + event.cause, 'error');
        });

        userAgent.on('unregistered', (event) => {
          console.warn('[Phone] ⚠️ SIP unregistered');
          console.warn('[Phone] Event:', event);
          updateCallStatus('Not registered', 'error');
        });

        console.log('[Phone] JsSIP User Agent created, starting registration...');
        console.log('[Phone] Will attempt to connect to:', wsUrl);
        userAgent.start();

      } catch (error) {
        console.error('[Phone] ❌ SIP initialization error:', error);
        console.error('[Phone] Error details:', {
          message: error.message,
          stack: error.stack
        });
        updateCallStatus('Initialization failed', 'error');
      }
    }

    // Show call confirmation modal
    function showCallConfirm() {
      console.log('[Phone] Call button clicked');

      const phoneNumber = document.getElementById('phoneDisplay').value.trim();
      if (!phoneNumber) {
        console.warn('[Phone] No phone number entered');
        updateCallStatus('Enter a number first', 'error');
        return;
      }

      console.log('[Phone] Phone number to call:', phoneNumber);

      if (!userAgent) {
        console.error('[Phone] ❌ User agent not initialized');
        updateCallStatus('SIP not ready', 'error');
        return;
      }

      // Find contact name if it exists
      const cleanedNumber = phoneNumber.replace(/\D/g, '');
      const contact = contacts.find(c => c.phone_number.replace(/\D/g, '') === cleanedNumber);
      // Use contact name if found, otherwise use phone number
      const displayName = contact ? (contact.contact_name || contact.name) : phoneNumber;

      console.log('[Phone] Showing call confirmation for:', displayName, '(contact found:', !!contact, ')');

      document.getElementById('callConfirmText').textContent =
        `Are you sure you want to talk to ${displayName}?`;
      document.getElementById('callConfirmModal').classList.add('show');
    }

    // Close call confirmation modal
    window.closeCallConfirm = function() {
      document.getElementById('callConfirmModal').classList.remove('show');
    };

    // Confirm and make the call
    window.confirmCall = function() {
      closeCallConfirm();
      actuallyMakeCall();
    };

    // Format phone number for North America dialing
    function formatForDialing(phoneNumber) {
      // Strip all non-digit characters
      const digitsOnly = phoneNumber.replace(/\D/g, '');

      // Handle North American numbers (10 or 11 digits)
      if (digitsOnly.length === 10) {
        // 10 digits: add country code +1
        return '1' + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly[0] === '1') {
        // 11 digits starting with 1: already has country code
        return digitsOnly;
      } else {
        // Other lengths: return as-is (for special codes like *97, etc.)
        return digitsOnly;
      }
    }

    // Make outbound call (actual implementation)
    function actuallyMakeCall() {
      const phoneNumber = document.getElementById('phoneDisplay').value.trim();
      const formattedNumber = formatForDialing(phoneNumber);

      console.log('[Phone] ===== INITIATING CALL =====');
      console.log('[Phone] Display number:', phoneNumber);
      console.log('[Phone] Formatted for dialing:', formattedNumber);

      // IMMEDIATE UI FEEDBACK - Update UI before making call
      updateCallStatus('Calling...', 'calling');
      document.getElementById('callBtn').style.display = 'none';
      document.getElementById('hangupBtn').style.display = 'block';

      // Mute early media immediately
      const remoteAudio = document.getElementById('remoteAudio');
      remoteAudio.volume = 0;

      // Start pulsing animation immediately
      const phoneToggle = document.getElementById('phoneToggle');
      phoneToggle.classList.add('phone-ringing');

      try {

        const sipServer = sipServerConfig?.server || 'vancouver3.voip.ms';
        const target = `sip:${formattedNumber}@${sipServer}`;
        console.log('[Phone] SIP target:', target);

        const options = {
          mediaConstraints: {
            audio: true,
            video: false
          },
          pcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        };

        console.log('[Phone] Initiating call...');
        currentSession = userAgent.call(target, options);
        callStartTime = Date.now();

        // Set up call event handlers
        currentSession.on('progress', (event) => {
          console.log('[Phone] 📞 Call progress (ringing)');
          updateCallStatus('Ringing...', 'calling');
          // UI already updated immediately on call button click
        });

        currentSession.on('accepted', (event) => {
          console.log('[Phone] ✅ Call accepted - connected!');
          updateCallStatus('Connected', 'connected');
          document.getElementById('callBtn').style.display = 'none';
          document.getElementById('hangupBtn').style.display = 'block';

          // Attach remote audio
          const remoteAudio = document.getElementById('remoteAudio');
          const remoteStream = event.stream || currentSession.connection.getRemoteStreams()[0];
          if (remoteStream) {
            remoteAudio.srcObject = remoteStream;
          }

          // Unmute audio for actual call
          remoteAudio.volume = 1;

          // Remove pulsing animation
          const phoneToggle = document.getElementById('phoneToggle');
          phoneToggle.classList.remove('phone-ringing');
        });

        currentSession.on('ended', (event) => {
          const duration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
          console.log(`[Phone] 🔴 Call ended - Duration: ${duration}s - Cause:`, event.cause);
          updateCallStatus('Call ended', '');
          document.getElementById('callBtn').style.display = 'block';
          document.getElementById('hangupBtn').style.display = 'none';

          // Remove pulsing animation
          const phoneToggle = document.getElementById('phoneToggle');
          phoneToggle.classList.remove('phone-ringing');

          // Save call history with formatted number
          console.log('[Phone] Saving call history...');
          saveCallHistory(formattedNumber, duration, 'completed');

          currentSession = null;
          callStartTime = null;
        });

        currentSession.on('failed', (event) => {
          console.error('[Phone] ❌ Call failed - Event:', event);
          const reason = event.cause || 'Unknown error';
          console.error('[Phone] Failure reason:', reason);
          updateCallStatus('Call failed: ' + reason, 'error');
          document.getElementById('callBtn').style.display = 'block';
          document.getElementById('hangupBtn').style.display = 'none';

          // Remove pulsing animation
          const phoneToggle = document.getElementById('phoneToggle');
          phoneToggle.classList.remove('phone-ringing');

          // Save call history with formatted number
          saveCallHistory(formattedNumber, 0, 'failed');

          currentSession = null;
          callStartTime = null;
        });

      } catch (error) {
        console.error('[Phone] ❌ Exception during call:', error);
        console.error('[Phone] Error stack:', error.stack);
        updateCallStatus('Error: ' + error.message, 'error');
      }
    }

    // Hang up call
    function hangupCall() {
      if (currentSession) {
        try {
          console.log('[Phone] Hanging up...');
          currentSession.terminate();
        } catch (error) {
          console.error('[Phone] Error hanging up:', error);
        }
      }
    }

    // Save call history to database
    async function saveCallHistory(phoneNumber, duration, status) {
      try {
        const response = await fetch('/api/calls/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone_number: phoneNumber,
            duration: duration,
            status: status
          })
        });

        if (response.ok) {
          console.log('[Phone] Call history saved');
          // Reload conversations to show call in history
          await loadConversations();
        } else {
          console.error('[Phone] Failed to save call history');
        }
      } catch (error) {
        console.error('[Phone] Error saving call history:', error);
      }
    }

    // Initialize SIP after all functions are defined and JsSIP is loaded
    if (typeof JsSIP !== 'undefined') {
      console.log('[Phone] JsSIP loaded, version:', JsSIP.version);
      initializeSIP();
    } else {
      console.error('[Phone] JsSIP not loaded - phone dialer will not work');
    }

    // ============================================
    // END PHONE DIALER
    // ============================================

    init();
