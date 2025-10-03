// app.js

const LOCAL_STORAGE_KEY = 'ece_event_draft';
let currentStep = 1;
let eventData = {}; // Main object to hold form state
let ticketTierCounter = 1; // Used for unique IDs for ticket tiers
const MAX_TAGS = 5;

// --- UTILITY FUNCTIONS (TOAST/SNACKBAR) ---

/** Shows a transient notification. */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const colors = {
        'success': 'bg-green-500 border-green-700',
        'error': 'bg-red-500 border-red-700',
        'info': 'bg-blue-500 border-blue-700',
    };
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info';

    const toast = document.createElement('div');
    toast.className = `p-3 rounded-lg text-white shadow-xl ${colors[type]} flex items-center space-x-2 transition-all duration-300 opacity-0 transform translate-x-10`;
    toast.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i><span>${message}</span>`;
    
    // Append and trigger animation
    container.appendChild(toast);
    lucide.createIcons(); // Initialize the icon
    
    setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-x-10');
        toast.classList.add('opacity-100', 'translate-x-0');
    }, 50);

    // Hide after duration
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-10');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

/** Shows a persistent notification (e.g., for undo). */
function showSnackbar(message, actionText, actionCallback) {
    const container = document.getElementById('snackbar-container');
    // Clear any existing snackbar
    container.innerHTML = ''; 

    const snackbar = document.createElement('div');
    snackbar.className = 'bg-gray-800 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center justify-between space-x-4 opacity-0 transform translate-y-full transition-all duration-300';
    snackbar.innerHTML = `
        <span>${message}</span>
        ${actionText ? `<button class="text-blue-400 font-semibold hover:text-blue-300 transition" id="snackbar-action">${actionText}</button>` : ''}
    `;

    container.appendChild(snackbar);
    
    setTimeout(() => {
        snackbar.classList.remove('opacity-0', 'translate-y-full');
        snackbar.classList.add('opacity-100', 'translate-y-0');
    }, 50);

    if (actionText) {
        document.getElementById('snackbar-action').onclick = () => {
            actionCallback();
            snackbar.remove();
        };
    }
    // Auto-hide after 8 seconds if no action is taken
    setTimeout(() => {
        snackbar.classList.add('opacity-0', 'translate-y-full');
        snackbar.addEventListener('transitionend', () => snackbar.remove());
    }, 8000);
}

// --- AUTOSAVE & INITIALIZATION ---

function updateAutosaveTimestamp() {
    const tsEl = document.getElementById('autosave-timestamp');
    const now = new Date();
    tsEl.textContent = `Draft saved ${now.toLocaleTimeString()}`;
}

function loadDraft() {
    const draft = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (draft) {
        eventData = JSON.parse(draft);
        showSnackbar('Draft loaded successfully.', 'Undo', () => {
            // Simple undo: clear the loaded data and reload to clean state
            eventData = {};
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            window.location.reload();
        });
        
        // Populate the form fields from eventData
        Object.keys(eventData).forEach(key => {
            const input = document.getElementById(key.replace(/_/g, '-'));
            if (input) {
                input.value = eventData[key];
            }
        });
        // Special handlers for complex fields
        populateComplexFields(eventData);

    } else {
        // Initialize with default empty state
        eventData = {
            title: '', description_html: '', tags: [],
            location_type: 'offline', capacity: 250, waitlist: false,
            recurrence_type: 'single', recurrence_frequency: 'weekly',
            ticket_tiers: [{ id: 1, name: 'General Admission', price: 200, capacity: null }]
        };
        // Ensure initial ticket tier is present
        renderTicketTiers();
    }
    updateAutosaveTimestamp();
    // Update preview with initial data
    updatePreview();
}

function autoSave() {
    // Collect all relevant data from form into eventData
    collectFormData();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(eventData));
    updateAutosaveTimestamp();
}

function collectFormData() {
    // A simplified, example function to map form inputs to eventData structure
    const form = document.getElementById('event-creation-form');
    const data = new FormData(form);

    eventData.title = data.get('title') || '';
    eventData.description_html = document.getElementById('event-description-editor').innerHTML;
    eventData.start_date = data.get('start_date') || '';
    eventData.end_date = data.get('end_date') || '';
    eventData.location_type = data.get('location-type');
    
    // Location details
    if (eventData.location_type === 'offline') {
        eventData.venue = data.get('venue') || '';
        delete eventData.online_url;
    } else {
        eventData.online_url = data.get('online_url') || '';
        delete eventData.venue;
    }

    // Step 2 Data
    eventData.capacity = parseInt(data.get('capacity') || 0);
    eventData.registration_deadline = data.get('registration_deadline') || '';
    eventData.waitlist = document.getElementById('waitlist-toggle').checked;
    
    eventData.recurrence_type = data.get('recurrence-type');
    if (eventData.recurrence_type === 'recurring') {
        eventData.recurrence = {
            frequency: data.get('recurrence_frequency'),
            interval: parseInt(data.get('recurrence_interval') || 1),
            end_condition: data.get('recurrence-end'),
            end_after: parseInt(data.get('recurrence_end_after') || 1),
            end_until: data.get('recurrence_end_until')
        };
    } else {
        delete eventData.recurrence;
    }
    
    // Tags are handled separately by their own event listeners
    // eventData.tags is updated live in the tag handlers

    // Note: Ticket tiers and file uploads require more complex collection logic
}

// --- VALIDATION LOGIC ---

function showValidationError(element, message) {
    element.classList.add('border-red-500');
    const errorEl = element.closest('.form-group').querySelector('.error-message') || element.nextElementSibling;
    if (errorEl && errorEl.classList.contains('error-message')) {
        errorEl.textContent = message;
        errorEl.classList.add('text-red-500');
    }
}

function clearValidationError(element) {
    element.classList.remove('border-red-500');
    const errorEl = element.closest('.form-group')?.querySelector('.error-message') || element.nextElementSibling;
    if (errorEl && errorEl.classList.contains('error-message')) {
        errorEl.textContent = '';
        errorEl.classList.remove('text-red-500');
    }
}

function validateStep(step) {
    let isValid = true;
    const stepEl = document.getElementById(`step-${step}`);
    const requiredInputs = stepEl.querySelectorAll('input[name], select[name], textarea[name], [contenteditable="true"]');
    
    requiredInputs.forEach(input => {
        // Clear previous error
        clearValidationError(input);
        
        let value = input.tagName === 'DIV' && input.contentEditable === 'true' ? input.textContent.trim() : input.value.trim();
        let name = input.name || input.id.replace(/-/g, '_');

        // Check required fields based on specification (Title, Dates, Location, Poster)
        if (['title', 'start_date', 'end_date', 'registration_deadline', 'capacity'].includes(name) && !value) {
            showValidationError(input, 'This field is required.');
            isValid = false;
        }

        // Title Max 120 chars
        if (name === 'title' && value.length > 120) {
            showValidationError(input, 'Title must be 120 characters or less.');
            isValid = false;
        }

        // Description validation (Rich Text Editor)
        if (input.id === 'event-description-editor') {
            const html = input.innerHTML.trim();
            const textContent = input.textContent.trim();
            if (!textContent) {
                 showValidationError(input, 'Description is required.');
                 isValid = false;
            } else if (textContent.length > 2000) {
                 showValidationError(input, 'Description is too long (max 2000 chars).');
                 isValid = false;
            }
        }
        
        // Date Logic
        if (name === 'start_date' && value) {
            const startDate = new Date(value);
            if (startDate < new Date()) {
                showValidationError(input, 'Start date cannot be in the past.');
                isValid = false;
            }
        }
        if (name === 'end_date' && value) {
            const endDate = new Date(value);
            const startDate = new Date(document.getElementById('start-date').value);
            if (endDate <= startDate) {
                showValidationError(input, 'End date must be after the start date.');
                isValid = false;
            }
        }
        if (name === 'registration_deadline' && value) {
            const deadline = new Date(value);
            const startDate = new Date(document.getElementById('start-date').value);
            if (deadline >= startDate) {
                showValidationError(input, 'Registration deadline must be before the start date.');
                isValid = false;
            }
        }

        // Location specific validation
        if (eventData.location_type === 'offline' && name === 'venue' && !value) {
            showValidationError(input, 'Venue address is required for offline events.');
            isValid = false;
        }
        if (eventData.location_type === 'online' && name === 'online_url' && !value) {
            showValidationError(input, 'Online URL is required for online events.');
            isValid = false;
        }
        
        // Capacity validation
        if (name === 'capacity' && parseInt(value) <= 0) {
             showValidationError(input, 'Capacity must be a positive number.');
             isValid = false;
        }
    });

    // File Uploads validation (Poster)
    const posterInput = document.getElementById('poster-upload');
    if (step === 1) { // Only validate files in step 1
        if (posterInput.files.length === 0 && !eventData.poster_url) {
            showValidationError(posterInput, 'A poster image is required.');
            isValid = false;
        } else if (posterInput.files.length > 0 && posterInput.files[0].size > 5 * 1024 * 1024) {
            showValidationError(posterInput, 'Poster file size cannot exceed 5MB.');
            isValid = false;
        }
    }
    
    // Note: Brochure size check is in its own upload handler

    return isValid;
}

// --- MULTI-STEP NAVIGATION ---

function updateStepUI() {
    // Update Tab UI
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('tab-active');
        if (tab.id === `tab-${currentStep}`) {
            tab.classList.add('tab-active');
        }
    });

    // Update Section Visibility
    document.querySelectorAll('.step-content').forEach(section => {
        section.classList.add('hidden');
        if (parseInt(section.dataset.step) === currentStep) {
            section.classList.remove('hidden');
        }
    });
    
    // Update Button States
    document.getElementById('prev-step-btn').disabled = currentStep === 1;
    const nextBtn = document.getElementById('next-step-btn');
    if (currentStep === 2) {
        nextBtn.textContent = 'Review & Publish';
        nextBtn.classList.remove('btn-primary');
        nextBtn.classList.add('btn-secondary'); // Disable for next/prev nav once at end
        nextBtn.disabled = true; // Use Publish button instead
    } else {
        nextBtn.textContent = 'Next';
        nextBtn.classList.remove('btn-secondary');
        nextBtn.classList.add('btn-primary');
        nextBtn.disabled = false;
    }
}

function goToStep(step) {
    if (step < currentStep) {
        currentStep = step;
        updateStepUI();
    } else if (step > currentStep) {
        // Validate current step before moving next
        if (validateStep(currentStep)) {
            currentStep = step;
            updateStepUI();
        } else {
            showToast('Please correct the highlighted errors.', 'error');
        }
    }
}

// --- REALTIME PREVIEW ---

function generateRecurrenceSummary(recurrence) {
    if (!recurrence || eventData.recurrence_type === 'single') return 'Single Event';
    
    let summary = `Repeats ${recurrence.frequency}`;
    if (recurrence.interval > 1) {
        summary += ` every ${recurrence.interval} weeks/months`;
    }
    
    if (recurrence.end_condition === 'after') {
        summary += `, ends after ${recurrence.end_after} occurrences.`;
    } else if (recurrence.end_condition === 'until' && recurrence.end_until) {
        summary += `, ends until ${new Date(recurrence.end_until).toLocaleDateString()}.`;
    }
    return summary;
}

function renderTicketTiers() {
    const container = document.getElementById('preview-tickets');
    container.innerHTML = '';
    
    eventData.ticket_tiers.forEach(tier => {
        const price = tier.price === 0 ? 'Free' : `₹${tier.price}`;
        const listItem = document.createElement('li');
        listItem.className = 'flex justify-between';
        listItem.innerHTML = `
            <span>${tier.name}</span>
            <span class="font-medium">${price}</span>
        `;
        container.appendChild(listItem);
    });
}

function updatePreview() {
    // Ensure data is up to date before updating preview
    collectFormData(); 

    // Update Title
    document.getElementById('preview-title').textContent = eventData.title || 'New Event Title';
    
    // Update Dates
    const start = eventData.start_date ? new Date(eventData.start_date).toLocaleString() : 'Date & Time TBA';
    document.getElementById('preview-dates').textContent = start;
    
    // Update Location
    let locationText = 'Location TBA';
    if (eventData.location_type === 'offline' && eventData.venue) {
        locationText = eventData.venue;
    } else if (eventData.location_type === 'online' && eventData.online_url) {
        locationText = 'Online Event';
    }
    document.getElementById('preview-location').textContent = locationText;
    
    // Update Recurrence Summary
    document.getElementById('preview-recurrence').textContent = generateRecurrenceSummary(eventData.recurrence);

    // Update Tickets
    renderTicketTiers();
}

// --- INITIALIZE LISTENERS ---

function initializeListeners() {
    // --- Step Navigation Listeners ---
    document.getElementById('next-step-btn').addEventListener('click', () => goToStep(currentStep + 1));
    document.getElementById('prev-step-btn').addEventListener('click', () => goToStep(currentStep - 1));
    document.getElementById('tab-1').addEventListener('click', (e) => { e.preventDefault(); goToStep(1); });
    document.getElementById('tab-2').addEventListener('click', (e) => { e.preventDefault(); goToStep(2); });

    // --- Header Actions ---
    document.getElementById('save-draft-btn').addEventListener('click', () => {
        autoSave();
        showToast('Draft saved successfully!', 'success');
    });

    document.getElementById('publish-btn').addEventListener('click', (e) => {
        if (!validateStep(1)) {
            goToStep(1);
            showToast('Please complete Step 1 with valid data.', 'error');
            return;
        }
        if (!validateStep(2)) {
            goToStep(2);
            showToast('Please complete Step 2 with valid data.', 'error');
            return;
        }

        // Simulate publish process
        const spinner = document.getElementById('publish-spinner');
        spinner.classList.remove('hidden');
        e.target.disabled = true;
        
        setTimeout(() => {
            spinner.classList.add('hidden');
            e.target.disabled = false;
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            showToast('Event published successfully!', 'success', 6000);
            // In a real app, this would redirect to the event detail page
        }, 3000);
    });
    
    // --- Form Field Listeners (Input/Change for Autosave & Preview) ---
    document.getElementById('event-creation-form').addEventListener('input', (e) => {
        // Debounced autosave
        clearTimeout(window.autosaveTimer);
        window.autosaveTimer = setTimeout(autoSave, 1500);

        // Realtime preview update
        if (['title', 'start_date', 'end_date', 'venue', 'online_url', 'recurrence-type', 'recurrence_end_after', 'recurrence_end_until'].includes(e.target.name || e.target.id)) {
            updatePreview();
        }
    });

    // --- Location Toggle Listener ---
    document.querySelectorAll('input[name="location-type"]').forEach(input => {
        input.addEventListener('change', (e) => {
            document.getElementById('offline-field').classList.add('hidden');
            document.getElementById('online-field').classList.add('hidden');
            if (e.target.value === 'offline') {
                document.getElementById('offline-field').classList.remove('hidden');
            } else {
                document.getElementById('online-field').classList.remove('hidden');
            }
            updatePreview();
        });
    });

    // --- Recurrence Toggle Listener ---
    document.querySelectorAll('input[name="recurrence-type"]').forEach(input => {
        input.addEventListener('change', (e) => {
            document.getElementById('recurrence-options').classList.toggle('hidden', e.target.value === 'single');
            updatePreview();
        });
    });

    // --- Tags Input Listener ---
    const tagsContainer = document.getElementById('tags-container');
    const tagsInput = document.getElementById('tags-input');

    const renderTags = () => {
        // Clear existing tags (excluding the input field)
        tagsContainer.querySelectorAll('.tag-item').forEach(tag => tag.remove());
        
        eventData.tags.forEach(tagText => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag-item bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded-full flex items-center space-x-1';
            tagEl.innerHTML = `<span>${tagText}</span><button type="button" class="tag-remove" data-tag="${tagText}"><i data-lucide="x" class="w-3 h-3 text-blue-600 hover:text-blue-800"></i></button>`;
            tagsContainer.insertBefore(tagEl, tagsInput);
        });
        lucide.createIcons();
    };

    tagsInput.addEventListener('keydown', (e) => {
        const value = tagsInput.value.trim();
        // Add tag on Enter/Comma
        if ((e.key === 'Enter' || e.key === ',') && value) {
            e.preventDefault();
            if (eventData.tags.length < MAX_TAGS && !eventData.tags.includes(value)) {
                eventData.tags.push(value);
                tagsInput.value = '';
                renderTags();
                autoSave();
            } else if (eventData.tags.length >= MAX_TAGS) {
                showToast('Maximum 5 tags allowed.', 'info');
            }
        }
        // Remove tag on Backspace if input is empty
        if (e.key === 'Backspace' && value === '' && eventData.tags.length > 0) {
            eventData.tags.pop();
            renderTags();
            autoSave();
        }
    });

    tagsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.tag-remove')) {
            const tagText = e.target.closest('.tag-remove').dataset.tag;
            eventData.tags = eventData.tags.filter(tag => tag !== tagText);
            renderTags();
            autoSave();
        }
    });


    // --- File Upload Listeners (Poster/Brochure) ---
    document.getElementById('poster-upload').addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const previewContainer = document.getElementById('poster-preview');
            const previewImg = document.getElementById('preview-poster-img');
            const sidebarImg = document.getElementById('preview-poster-img-sidebar');

            // Size check (Acceptance Criteria)
            if (file.size > 5 * 1024 * 1024) {
                showToast('Poster must be ≤5MB.', 'error');
                this.value = ''; // Clear input
                previewContainer.classList.add('hidden');
                return;
            }

            // Preview logic
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                sidebarImg.src = e.target.result;
                previewImg.classList.remove('hidden');
                sidebarImg.classList.remove('hidden');
                previewContainer.classList.remove('hidden');
                previewContainer.querySelector('i').classList.add('hidden');
                document.getElementById('preview-poster').querySelector('i').classList.add('hidden');
            };
            reader.readAsDataURL(file);
            autoSave();
        }
    });
    
    document.getElementById('brochure-upload').addEventListener('change', function() {
        if (this.files && this.files[0]) {
             const file = this.files[0];
             // Size check
             if (file.size > 10 * 1024 * 1024) {
                 showToast('Brochure must be ≤10MB.', 'error');
                 this.value = ''; // Clear input
             } else {
                 showToast('Brochure uploaded.', 'info');
             }
        }
    });


    // --- Rich Text Editor Listener ---
    const editor = document.getElementById('event-description-editor');
    const charCounter = editor.closest('.form-group').querySelector('.char-counter');

    // Toolbar commands
    document.getElementById('editor-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.dataset.command) {
            e.preventDefault();
            const command = btn.dataset.command;
            
            if (command === 'createLink') {
                const url = prompt('Enter the URL:', 'http://');
                if (url) {
                    document.execCommand(command, false, url);
                }
            } else {
                document.execCommand(command, false, null);
            }
            editor.focus();
        }
    });

    // Content update/char count
    editor.addEventListener('input', () => {
        const textLength = editor.textContent.length;
        charCounter.textContent = `${textLength}/2000`;
        if (textLength > 2000) {
            charCounter.classList.add('text-red-500');
        } else {
            charCounter.classList.remove('text-red-500');
        }
        updatePreview();
    });

    // --- Ticket Tier Management ---
    const ticketContainer = document.getElementById('ticket-tiers-container');
    document.getElementById('add-tier-btn').addEventListener('click', () => {
        ticketTierCounter++;
        const newTier = { id: ticketTierCounter, name: `Custom Tier ${ticketTierCounter - 1}`, price: 0, capacity: null };
        eventData.ticket_tiers.push(newTier);
        renderTicketTiers(); // Update sidebar
        renderTicketFormTiers(); // Re-render form section
        autoSave();
    });
    
    // Delegate click handler for removing tiers
    ticketContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-action="remove-tier"]');
        if (removeBtn) {
            const tierId = parseInt(removeBtn.closest('.ticket-tier').dataset.id);
            if (eventData.ticket_tiers.length > 1) {
                eventData.ticket_tiers = eventData.ticket_tiers.filter(t => t.id !== tierId);
                renderTicketFormTiers();
                renderTicketTiers();
                autoSave();
            }
        }
    });
    
    // Delegate input handler for updating tier data
    ticketContainer.addEventListener('input', (e) => {
        const input = e.target;
        const tierEl = input.closest('.ticket-tier');
        const tierId = parseInt(tierEl.dataset.id);
        const tier = eventData.ticket_tiers.find(t => t.id === tierId);

        if (tier) {
            if (input.name === 'tier_name') tier.name = input.value;
            if (input.name === 'price') tier.price = parseInt(input.value || 0);
            if (input.name === 'tier_capacity') tier.capacity = input.value ? parseInt(input.value) : null;
            
            updatePreview(); // Re-render sidebar tickets
            autoSave();
        }
    });
    
    function renderTicketFormTiers() {
        ticketContainer.innerHTML = ''; // Clear and re-render all form tiers
        
        eventData.ticket_tiers.forEach(tier => {
            const tierHtml = `
                <div class="ticket-tier p-4 border rounded-md bg-gray-50" data-id="${tier.id}">
                    <h4 class="font-medium flex justify-between items-center">
                        <input type="text" name="tier_name" value="${tier.name}" class="text-base font-medium bg-transparent border-none p-0 focus:ring-0 w-3/4" ${tier.id === 1 ? 'disabled' : ''}>
                        <button type="button" class="text-red-500 hover:text-red-700 disabled:opacity-50" data-action="remove-tier" ${eventData.ticket_tiers.length === 1 ? 'disabled' : ''}>
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </h4>
                    <div class="grid sm:grid-cols-3 gap-4 mt-2">
                        <div class="form-group col-span-1">
                            <label for="price-${tier.id}">Price (₹)</label>
                            <input type="number" id="price-${tier.id}" name="price" value="${tier.price}" min="0">
                        </div>
                        <div class="form-group col-span-2">
                            <label for="tier-capacity-${tier.id}">Capacity (0 for unlimited)</label>
                            <input type="number" id="tier-capacity-${tier.id}" name="tier_capacity" value="${tier.capacity !== null ? tier.capacity : ''}" min="0">
                        </div>
                    </div>
                    </div>
            `;
            ticketContainer.insertAdjacentHTML('beforeend', tierHtml);
        });
        lucide.createIcons();
    }
    
    // --- Mobile Preview Toggle ---
    document.getElementById('mobile-preview-toggle').addEventListener('click', (e) => {
        const content = document.getElementById('event-preview-content');
        const isCollapsed = e.target.dataset.state === 'collapsed';
        
        if (isCollapsed) {
            content.classList.remove('hidden');
            e.target.dataset.state = 'expanded';
            e.target.textContent = 'Hide Preview';
        } else {
            content.classList.add('hidden');
            e.target.dataset.state = 'collapsed';
            e.target.textContent = 'Show Preview';
        }
    });

}

// --- MAIN EXECUTION ---
document.addEventListener('DOMContentLoaded', () => {
    // Note: Skeleton preview is not fully implemented but the placeholder is in HTML
    
    // Load existing data from localStorage
    loadDraft();
    
    // Initialize all event listeners
    initializeListeners();
    
    // Set up initial UI (currentStep = 1)
    updateStepUI();
    
    // Render complex fields (like tags/tickets) based on loaded data
    renderTags();
    renderTicketFormTiers();
});