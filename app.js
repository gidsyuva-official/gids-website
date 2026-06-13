/* ============================================================
   GLOBAL INDIA DIGITAL SOLUTION — COMPLETE JAVASCRIPT
   app.js | Routing | Auth | Animations | Interactions
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────
   PAGE ROUTING SYSTEM
   ───────────────────────────────────────── */

/**
 * Show a specific page and hide all others.
 * @param {string} pageId - The id of the page div to show
 * @param {string} [scrollTargetId] - Optional element id to scroll to after page load
 */
function showPage(pageId, scrollTargetId) {
  // Get all pages
  const pages = document.querySelectorAll('.page');

  // Hide all pages
  pages.forEach(page => {
    page.classList.remove('active');
  });

  // Show target page
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');

    if (scrollTargetId) {
      setTimeout(() => {
        const el = document.getElementById(scrollTargetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    } else {
      // Scroll to top instantly — no blank space flash
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    // Reset body scroll
    document.body.style.overflow = '';

    // Re-init scroll reveal for new page
    setTimeout(initScrollReveal, 100);

    // Add active class to correct nav link
    updateNavActiveState(pageId);

    if (pageId === 'page-dashboard') {
      loadReviews();
    }
    
    if (pageId === 'page-login') {
      setTimeout(typeAuthSidebarText, 300);
    }

    if (pageId === 'page-signup') {
      setTimeout(typeSignupSidebarText, 300);
    }

    // Close mobile nav if open
    closeAllNavs();
  }
}

/**
 * Navigate to Training page and scroll to Exam Coaching cards
 */
function goToTrainingCourses() {
  showPage('page-training', 'exam-coaching-section');
}

/**
 * Update the active state on nav links based on current page
 * @param {string} pageId
 */
function updateNavActiveState(pageId) {
  // Remove active from ALL nav links across all pages first
  const allNavLinks = document.querySelectorAll('.nav-link');
  allNavLinks.forEach(link => link.classList.remove('active'));

  // Map page IDs to the link text we want to highlight
  const pageToLinkText = {
    'page-dashboard': 'Home',
    'page-training':  'Training',
    'page-services':  'Services',
    'page-whoweare':  'Who We Are?',
  };

  const targetText = pageToLinkText[pageId];
  if (!targetText) return;

  // Find all nav links matching the target text and mark them active
  allNavLinks.forEach(link => {
    if (link.textContent.trim() === targetText && !link.classList.contains('logout-link')) {
      link.classList.add('active');
    }
  });
}

/* ─────────────────────────────────────────
   AUTHENTICATION
   ───────────────────────────────────────── */



/**
 * Handle login form submission
 */
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const tosChecked = document.getElementById('login-tos').checked;
  const errorEl = document.getElementById('login-error');

  // Validate TOS
  if (!tosChecked) {
    showError(errorEl, 'Please agree to the Terms & Conditions to continue.');
    shakeElement(document.querySelector('#page-login .auth-panel'));
    return;
  }

  // Validate fields
  if (!username || !password) {
    showError(errorEl, 'Please enter both username and password.');
    shakeElement(document.querySelector('#page-login .auth-panel'));
    return;
  }

  // Hide error initially
  errorEl.classList.add('hidden');

  const btn = document.querySelector('#page-login .auth-btn');
  btn.textContent = 'Signing In...';
  btn.disabled = true;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      const sessionUser = data.user && (data.user.loginName || data.user.username || username);

      setCurrentUserProfile({
        loginName: sessionUser,
        firstName: data.user && data.user.firstName ? data.user.firstName : '',
        lastName: data.user && data.user.lastName ? data.user.lastName : '',
        email: data.user && data.user.email ? data.user.email : '',
        phone: data.user && data.user.phone ? data.user.phone : ''
      });
      if (data.token) {
        localStorage.setItem('authToken', data.token);
      }

      // Populate forms with user data after login
      populateUserForms();

      // Navigate to dashboard
      btn.textContent = 'Sign In →';
      btn.disabled = false;
      showPage('page-dashboard');
    } else {
      showError(errorEl, data.message || 'Invalid username or password.');
      shakeElement(document.querySelector('#page-login .auth-panel'));
      document.getElementById('login-password').value = '';
      btn.textContent = 'Sign In →';
      btn.disabled = false;
    }
  } catch (err) {
    showError(errorEl, 'Could not connect to server. Please try again.');
    shakeElement(document.querySelector('#page-login .auth-panel'));
    document.getElementById('login-password').value = '';
    btn.textContent = 'Sign In →';
    btn.disabled = false;
  }
}

/**
 * Handle sign-up form submission
 */
async function handleSignup() {
  const firstName = document.getElementById('su-first').value.trim();
  const lastName = document.getElementById('su-last').value.trim();
  const email    = document.getElementById('su-email').value.trim();
  const phone    = document.getElementById('su-phone').value.trim();
  const password = document.getElementById('su-password').value;
  const confirmPassword = document.getElementById('su-confirm').value;
  const role     = document.getElementById('su-role').value;
  const agreeTerms = document.getElementById('su-tos').checked;
  const successEl = document.getElementById('signup-success');

  // Validate fields with clearer messages
  const missingFields = [];
  if (!firstName) missingFields.push('First name');
  if (!lastName) missingFields.push('Last name');
  if (!email) missingFields.push('Email address');
  if (!phone) missingFields.push('Phone number');
  if (!password) missingFields.push('Password');
  if (!confirmPassword) missingFields.push('Confirm password');
  if (!role) missingFields.push('Role');

  if (missingFields.length) {
    alert('Please fill in the following fields: ' + missingFields.join(', ') + '.');
    return;
  }

  // Validate email
  if (!isValidEmail(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  // Validate phone
  if (phone.replace(/\D/g, '').length < 10) {
    alert('Please enter a valid phone number.');
    return;
  }

  // Validate passwords match
  if (password !== confirmPassword) {
    alert('Passwords do not match. Please try again.');
    document.getElementById('su-confirm').value = '';
    document.getElementById('su-confirm').focus();
    return;
  }

  // Validate password length
  if (password.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }

  // Validate last name initial style
  if (!/^[A-Za-z]{1,4}$/.test(lastName)) {
    alert('Please enter a valid last name initial (for example: J).');
    document.getElementById('su-last').focus();
    return;
  }

  // Validate TOS
  if (!agreeTerms) {
    alert('Please agree to the Terms & Conditions.');
    return;
  }

  // Send to backend
  const btn = document.querySelector('#page-signup .auth-btn');
  btn.textContent = 'Creating Account...';
  btn.disabled = true;

  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
        password,
        confirmPassword,
        role,
        agreeTerms,
        fullName: `${firstName} ${lastName}`.trim(),
        username: `${firstName} ${lastName}`.trim()
      })
    });

    const data = await response.json();

    btn.textContent = 'Create Account →';
    btn.disabled = false;

    if (data.success) {
      successEl.classList.remove('hidden');
      successEl.innerHTML = `
        <strong>${data.message}</strong>
        <div style="margin-top:10px;font-size:0.95rem;color:#1f2937;">
          Please check your inbox for the verification email. Open the email and click the link to complete verification before accessing the dashboard.
        </div>
      `;
      // Clear form
      document.getElementById('su-first').value = '';
      document.getElementById('su-last').value = '';
      document.getElementById('su-email').value = '';
      document.getElementById('su-phone').value = '';
      document.getElementById('su-password').value = '';
      document.getElementById('su-confirm').value = '';
      document.getElementById('su-role').value = '';
      document.getElementById('su-tos').checked = false;
    } else {
      alert(data.message || 'Sign up failed. Please try again.');
    }
  } catch (err) {
    btn.textContent = 'Create Account →';
    btn.disabled = false;
    alert('Could not connect to server. Please run the backend (npm start) and try again.');
  }
}

/**
 * Handle logout
 */
function clearCurrentUserProfile() {
  sessionStorage.removeItem('gids_logged_in');
  sessionStorage.removeItem('gids_user');
  localStorage.removeItem('authToken');
  localStorage.removeItem('gids_user');
  localStorage.removeItem('gids_full_name');
  localStorage.removeItem('gids_email');
  localStorage.removeItem('gids_phone');
}

function setCurrentUserProfile(user) {
  const userKey = user.loginName || user.username || user.email || '';
  const fullName = ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.fullName || user.loginName || userKey;

  sessionStorage.setItem('gids_logged_in', 'true');
  sessionStorage.setItem('gids_user', userKey);
  localStorage.setItem('gids_user', userKey);
  localStorage.setItem('gids_full_name', fullName);
  localStorage.setItem('gids_email', user.email || '');
  localStorage.setItem('gids_phone', user.phone || '');
}

function getCurrentUserProfile() {
  return {
    username: localStorage.getItem('gids_user') || sessionStorage.getItem('gids_user') || '',
    fullName: localStorage.getItem('gids_full_name') || '',
    email: localStorage.getItem('gids_email') || '',
    phone: localStorage.getItem('gids_phone') || ''
  };
}

function populateUserForms() {
  const profile = getCurrentUserProfile();
  if (!profile.fullName && !profile.email && !profile.phone) return;

  const enrollName = document.getElementById('enroll-name');
  const enrollPhone = document.getElementById('enroll-phone');
  const enrollEmail = document.getElementById('enroll-email');
  const contactName = document.getElementById('contact-name');
  const contactPhone = document.getElementById('contact-phone');
  const contactEmail = document.getElementById('contact-email');

  if (enrollName && profile.fullName) enrollName.value = profile.fullName;
  if (enrollPhone && profile.phone) enrollPhone.value = profile.phone;
  if (enrollEmail && profile.email) enrollEmail.value = profile.email;

  if (contactName && profile.fullName) contactName.value = profile.fullName;
  if (contactPhone && profile.phone) contactPhone.value = profile.phone;
  if (contactEmail && profile.email) contactEmail.value = profile.email;
}

function handleLogout() {
  clearCurrentUserProfile();
  showPage('page-login');
}

/* ─────────────────────────────────────────
   TOAST NOTIFICATIONS
   ───────────────────────────────────────── */

let toastTimer = null;

/**
 * Show a top success popup message
 * @param {string} title
 * @param {string} message
 */
function showToast(title, message) {
  const container = document.getElementById('toast-container');
  const titleEl = document.getElementById('toast-title');
  const messageEl = document.getElementById('toast-message');

  if (!container || !titleEl || !messageEl) return;

  titleEl.textContent = title;
  messageEl.textContent = message;
  container.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  const container = document.getElementById('toast-container');
  if (container) container.classList.add('hidden');
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

/* ─────────────────────────────────────────
   ENROLL MODAL
   ───────────────────────────────────────── */

let currentEnrollCourse = '';
let currentReviewRating = 5;
const REVIEW_ADMIN_EMAIL = 'gids.yuva@gmail.com';

/**
 * Open the enroll modal for a course
 * @param {string} courseName
 */
function openEnroll(courseName) {
  currentEnrollCourse = courseName;

  const modal = document.getElementById('enroll-modal');
  const nameEl = document.getElementById('enroll-course-name');
  const successEl = document.getElementById('enroll-success');

  nameEl.textContent = courseName;
  successEl.classList.add('hidden');

  // Clear fields first, then autofill with logged-in user data if available
  ['enroll-name', 'enroll-phone', 'enroll-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const profile = getCurrentUserProfile();
  if (profile.fullName) {
    const el = document.getElementById('enroll-name');
    if (el) el.value = profile.fullName;
  }
  if (profile.phone) {
    const el = document.getElementById('enroll-phone');
    if (el) el.value = profile.phone;
  }
  if (profile.email) {
    const el = document.getElementById('enroll-email');
    if (el) el.value = profile.email;
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Animate in
  const box = modal.querySelector('.modal-box');
  box.style.transform = 'scale(0.85)';
  box.style.opacity = '0';
  setTimeout(() => {
    box.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease';
    box.style.transform = 'scale(1)';
    box.style.opacity = '1';
  }, 10);
}

/**
 * Close the enroll modal
 */
function closeEnroll() {
  const modal = document.getElementById('enroll-modal');
  const box = modal.querySelector('.modal-box');

  box.style.transform = 'scale(0.85)';
  box.style.opacity = '0';

  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }, 300);
}

/**
 * Submit enrollment form
 */
function submitEnroll() {
  const name   = document.getElementById('enroll-name').value.trim();
  const phone  = document.getElementById('enroll-phone').value.trim();
  const email  = document.getElementById('enroll-email').value.trim();
  const mode   = document.getElementById('enroll-mode').value;

  if (!name || !phone || !email) {
    alert('Please fill in all fields.');
    return;
  }

  if (!isValidEmail(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  if (!currentEnrollCourse) {
    alert('Course not selected. Please try again.');
    return;
  }

  const btn = document.querySelector('#enroll-modal .auth-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Submitting...';
  btn.disabled = true;

  const payload = {
    name,
    phone,
    email,
    course: currentEnrollCourse,
    mode
  };

  fetch('/api/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    btn.textContent = originalText;
    btn.disabled = false;

    if (data.success) {
      closeEnroll();
      showToast(
        '🎉 Enrollment Successful!',
        'Welcome aboard! Your enrollment has been confirmed. Get ready to start your learning journey and unlock new opportunities.'
      );
    } else {
      alert(data.message || 'Enrollment failed. Please try again.');
    }
  })
  .catch(() => {
    btn.textContent = originalText;
    btn.disabled = false;
    alert('Could not connect to server. Please run the backend (npm start) and try again.');
  });
}

/* ─────────────────────────────────────────
   CONTACT FORM
   ───────────────────────────────────────── */

/**
 * Handle contact/message form submission
 */
function handleContact() {
  const name    = document.getElementById('contact-name').value.trim();
  const email   = document.getElementById('contact-email').value.trim();
  const phone   = document.getElementById('contact-phone').value.trim();
  const service = document.getElementById('contact-service').value;
  const message = document.getElementById('contact-message').value.trim();
  const btn     = document.querySelector('#contact-section .send-btn');
  const originalText = btn.textContent;

  if (!name || !email || !phone || !service || !message) {
    alert('Please fill in all fields and select a service.');
    return;
  }

  if (!isValidEmail(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  btn.textContent = 'Sending...';
  btn.disabled = true;

  const data = { name, email, phone, service, message };

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(result => {
    btn.textContent = originalText;
    btn.disabled = false;

    if (result.success) {
      document.getElementById('contact-name').value = '';
      document.getElementById('contact-email').value = '';
      document.getElementById('contact-phone').value = '';
      document.getElementById('contact-service').value = '';
      document.getElementById('contact-message').value = '';
      showToast(
        '🎉 Consultation Booked Successfully!',
        'Thank you for scheduling your consultation. Our team will connect with you at the selected time. We look forward to helping you achieve your goals.'
      );
    } else {
      alert(result.message || 'Failed to send message. Please try again.');
    }
  })
  .catch(() => {
    btn.textContent = originalText;
    btn.disabled = false;
    alert('Could not connect to server. Please run the backend (npm start) and try again.');
  });
}

/* ─────────────────────────────────────────
   REVIEW SYSTEM
   ───────────────────────────────────────── */

function getCurrentUserEmail() {
  return localStorage.getItem('gids_email') || sessionStorage.getItem('gids_email') || '';
}

function getCurrentUserName() {
  return localStorage.getItem('gids_full_name') || sessionStorage.getItem('gids_full_name') || '';
}

function getAddReviewCardHtml() {
  return `
    <div class="testi-card testi-add-card" onclick="openReviewForm()" role="button" tabindex="0">
      <div class="testi-header">
        <div class="testi-avatar">+</div>
        <div>
          <div class="testi-name">Add Your Review</div>
          <div class="testi-role">Share your experience</div>
        </div>
      </div>
      <p class="testi-text" style="text-align: center; margin-top: 16px;">Tap to add your review with star rating.</p>
    </div>
  `;
}

function renderReviewCard(review) {
  const currentUserEmail = getCurrentUserEmail();
  const canDelete = currentUserEmail === review.email || currentUserEmail === REVIEW_ADMIN_EMAIL;
  const stars = '★★★★★'.slice(0, review.rating) + '☆☆☆☆☆'.slice(0, 5 - review.rating);

  return `
    <div class="testi-card">
      <div class="testi-header">
        <div class="testi-avatar">${review.name ? review.name.slice(0, 2).toUpperCase() : 'U'}</div>
        <div>
          <div class="testi-name">${escapeHtml(review.name)}</div>
          <div class="testi-role">${escapeHtml(review.role || 'Learner')}</div>
        </div>
        <div class="testi-stars">${stars}</div>
      </div>
      <p class="testi-text">${escapeHtml(review.comment)}</p>
      ${canDelete ? `<button class="btn-delete-review" onclick="deleteReview(${review.id}, event)">Delete</button>` : ''}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderReviewStars() {
  const row = document.getElementById('review-stars');
  if (!row) return;
  row.innerHTML = '';
  for (let i = 1; i <= 5; i += 1) {
    const filled = i <= currentReviewRating ? '★' : '☆';
    row.innerHTML += `<span onclick="setReviewRating(${i})" style="font-size:1.3rem;cursor:pointer;">${filled}</span>`;
  }
}

function loadReviews() {
  const grid = document.getElementById('testimonial-grid');
  if (!grid) return;
  fetch('/api/reviews')
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        grid.innerHTML = getAddReviewCardHtml();
        return;
      }
      const cards = [getAddReviewCardHtml(), ...data.reviews.map(renderReviewCard)];
      grid.innerHTML = cards.join('');
    })
    .catch(() => {
      grid.innerHTML = getAddReviewCardHtml();
    });
}

function openReviewForm() {
  const modal = document.getElementById('review-modal');
  if (!modal) return;
  const nameInput = document.getElementById('review-name');
  const roleInput = document.getElementById('review-role');
  const emailInput = document.getElementById('review-email');
  const commentInput = document.getElementById('review-comment');

  if (nameInput) nameInput.value = getCurrentUserName();
  if (emailInput) emailInput.value = getCurrentUserEmail();
  if (roleInput && !roleInput.value) roleInput.value = 'Student';
  if (commentInput) commentInput.value = '';
  currentReviewRating = 5;
  renderReviewStars();

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeReviewForm() {
  const modal = document.getElementById('review-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function setReviewRating(value) {
  currentReviewRating = value;
  renderReviewStars();
}

async function submitReview() {
  const name = document.getElementById('review-name').value.trim();
  const role = document.getElementById('review-role').value.trim();
  const email = document.getElementById('review-email').value.trim();
  const comment = document.getElementById('review-comment').value.trim();
  const successEl = document.getElementById('review-success');

  if (!name || !email || !comment) {
    alert('Please fill in your name, email and review comment.');
    return;
  }

  if (!isValidEmail(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  const btn = document.querySelector('#review-modal .auth-btn');
  const originalText = btn ? btn.textContent : 'Submit Review →';
  if (btn) {
    btn.textContent = 'Submitting...';
    btn.disabled = true;
  }

  try {
    const response = await fetch('/api/reviews/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, email, rating: currentReviewRating, comment })
    });
    const data = await response.json();

    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }

    if (data.success) {
      if (successEl) {
        successEl.classList.remove('hidden');
      }
      setTimeout(() => {
        if (successEl) {
          successEl.classList.add('hidden');
        }
      }, 3000);
      closeReviewForm();
      loadReviews();
    } else {
      alert(data.message || 'Could not submit review.');
    }
  } catch (err) {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
    alert('Could not connect to server. Please run the backend (npm start) and try again.');
  }
}

async function deleteReview(id, event) {
  if (event) {
    event.preventDefault();
  }
  const email = getCurrentUserEmail();
  if (!email) {
    alert('Please log in or enter your email to delete a review.');
    return;
  }
  if (!confirm('Delete this review? This cannot be undone.')) return;

  try {
    const response = await fetch('/api/reviews/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, email })
    });
    const data = await response.json();
    if (data.success) {
      loadReviews();
      showToast('Review Deleted', 'Your review has been removed successfully.');
    } else {
      alert(data.message || 'Could not delete review.');
    }
  } catch (err) {
    alert('Could not connect to server. Please try again.');
  }
}

/* ─────────────────────────────────────────
   FAQ ACCORDION
   ───────────────────────────────────────── */

/**
 * Toggle FAQ item open/closed
 * @param {HTMLElement} el - The .faq-item element
 */
function toggleFaq(el) {
  const isOpen = el.classList.contains('open');

  // Close all FAQs first
  document.querySelectorAll('.faq-item.open').forEach(item => {
    item.classList.remove('open');
  });

  // Open clicked item if it wasn't already open
  if (!isOpen) {
    el.classList.add('open');
  }
}

/* ─────────────────────────────────────────
   PASSWORD TOGGLE
   ───────────────────────────────────────── */

/**
 * Toggle password visibility
 * @param {string} inputId - ID of the password input
 * @param {HTMLElement} btn - The toggle button element
 */
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🔒';
    btn.title = 'Hide password';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
    btn.title = 'Show password';
  }
}

/* ─────────────────────────────────────────
   MOBILE NAVIGATION
   ───────────────────────────────────────── */

let navOpen = false;

/**
 * Toggle mobile navigation — accepts the nav links element id
 * @param {string} navLinksId
 */
function toggleNav(navLinksId) {
  const navLinks = document.getElementById(navLinksId);
  const overlay  = document.getElementById('nav-overlay');
  if (!navLinks) return;

  navOpen = !navOpen;
  if (navOpen) {
    navLinks.classList.add('mobile-open');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    closeMobileNav();
  }
}

/**
 * Close all mobile navs
 */
function closeAllNavs() {
  closeMobileNav();
}

/**
 * Close mobile navigation
 */
function closeMobileNav() {
  navOpen = false;
  document.querySelectorAll('.nav-links.mobile-open').forEach(nl => {
    nl.classList.remove('mobile-open');
  });
  const overlay = document.getElementById('nav-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ─────────────────────────────────────────
   SCROLL REVEAL ANIMATIONS
   ───────────────────────────────────────── */

let scrollObserver = null;

/**
 * Initialize Intersection Observer for scroll reveal animations
 */
function initScrollReveal() {
  // Disconnect previous observer
  if (scrollObserver) {
    scrollObserver.disconnect();
  }

  // Get current active page
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;

  // Reset animation state when switching pages
  activePage.querySelectorAll('.reveal, .reveal-left, .reveal-right, .stagger-children').forEach(el => {
    el.classList.remove('visible');
  });

  // Cards & interactive blocks — slide up one by one
  const toReveal = activePage.querySelectorAll(
    '.why-card, .testi-card, .faq-item, .course-card, .skill-card, ' +
    '.srv-card, .tsrv-card, .mv-card, .offer-item, .number-item, ' +
    '.hero-card, .audience-tab, .team-card, .lm-card, .cf-item, ' +
    '.contact-card, .contact-form-card, .office-hours-card, .learning-modes'
  );

  toReveal.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = `${(i % 8) * 0.08}s`;
  });

  // Section headings & intro text
  activePage.querySelectorAll(
    '.section-title, .section-sub, .ts-header, .ts-title, .ts-sub, ' +
    '.lm-title, .lm-sub, .inner-hero-title, .inner-hero-tag, .about-title, ' +
    '.about-subtitle, .tally-cta-inner, .location-card'
  ).forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = `${(i % 5) * 0.06}s`;
  });

  const staggerTargets = activePage.querySelectorAll(
    '.why-grid, .hero-cards, .testimonial-grid, .course-grid, ' +
    '.skill-grid, .services-grid, .mv-grid, .numbers-grid, .team-grid, ' +
    '.lm-grid, .faq-list, .offer-grid, .stats-bar, .contact-grid, ' +
    '.tally-services, .audience-tabs, .course-features-banner'
  );

  staggerTargets.forEach(el => {
    el.classList.add('stagger-children');
  });

  // Create observer
  scrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          scrollObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );

  // Observe all reveal elements
  activePage.querySelectorAll('.reveal, .reveal-left, .reveal-right, .stagger-children').forEach(el => {
    scrollObserver.observe(el);
  });
}

/* ─────────────────────────────────────────
   NAVBAR SCROLL EFFECT
   ───────────────────────────────────────── */

/**
 * Add shadow to navbar on scroll
 */
function initNavbarScroll() {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      document.querySelectorAll('.main-nav').forEach(n => n.classList.add('scrolled'));
    } else {
      document.querySelectorAll('.main-nav').forEach(n => n.classList.remove('scrolled'));
    }
  }, { passive: true });
}

/* ─────────────────────────────────────────
   AD BANNER PAUSE ON HOVER
   ───────────────────────────────────────── */
function initAdBanners() {
  document.querySelectorAll('.ad-banner').forEach(banner => {
    const track = banner.querySelector('.ad-track');
    if (!track) return;

    banner.addEventListener('mouseenter', () => {
      track.style.animationPlayState = 'paused';
    });

    banner.addEventListener('mouseleave', () => {
      track.style.animationPlayState = 'running';
    });
  });
}

/* ─────────────────────────────────────────
   CLOSE MODAL ON OVERLAY CLICK
   ───────────────────────────────────────── */
function initModalOverlayClose() {
  const overlay = document.getElementById('enroll-modal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeEnroll();
    });
  }
}

/* ─────────────────────────────────────────
   KEYBOARD ACCESSIBILITY
   ───────────────────────────────────────── */
function initKeyboardHandlers() {
  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEnroll();
      closeMobileNav();
    }

    // Enter key on login form
    if (e.key === 'Enter') {
      const activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'page-login') {
        handleLogin();
      }
    }
  });
}

/* ─────────────────────────────────────────
   COUNTER ANIMATION (for numbers section)
   ───────────────────────────────────────── */

/**
 * Animate a counter from 0 to target value
 * @param {HTMLElement} el
 * @param {number} target
 * @param {string} suffix - e.g. '+', '%'
 * @param {number} duration - in ms
 */
function animateCounter(el, target, suffix, duration) {
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start += step;
    if (start >= target) {
      el.textContent = target + suffix;
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(start) + suffix;
    }
  }, 16);
}

/**
 * Initialize counter animations on scroll into view
 */
function initCounterAnimations() {
  const counters = document.querySelectorAll('.big-num, .stat-num');
  if (!counters.length) return;

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.animated) {
        entry.target.dataset.animated = 'true';
        const text = entry.target.textContent;
        const suffix = text.replace(/[0-9]/g, '');
        const num = parseInt(text.replace(/\D/g, ''), 10);
        if (!isNaN(num)) {
          animateCounter(entry.target, num, suffix, 1500);
        }
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => counterObserver.observe(c));
}

/* ─────────────────────────────────────────
   UTILITY FUNCTIONS
   ───────────────────────────────────────── */

/**
 * Show an error element with message
 * @param {HTMLElement} el
 * @param {string} msg
 */
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

/**
 * Add shake animation to element
 * @param {HTMLElement} el
 */
function shakeElement(el) {
  if (!el) return;
  el.style.animation = 'none';
  el.style.transition = 'transform 0.1s ease';

  const shakes = [
    [0, '0'],
    [50, '-8px'],
    [100, '8px'],
    [150, '-6px'],
    [200, '6px'],
    [250, '-4px'],
    [300, '4px'],
    [350, '0']
  ];

  shakes.forEach(([delay, val]) => {
    setTimeout(() => {
      el.style.transform = `translateX(${val})`;
    }, delay);
  });

  setTimeout(() => {
    el.style.transform = '';
    el.style.transition = '';
  }, 400);
}

/**
 * Validate email address
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─────────────────────────────────────────
   SMOOTH LINK CLICKS (footer / internal)
   ───────────────────────────────────────── */

/**
 * Intercept anchor clicks and prevent default for hash-only links
 */
function initSmoothLinks() {
  document.querySelectorAll('a[href="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
    });
  });
}

/* ─────────────────────────────────────────
   FIELD INPUT FLOATING LABEL EFFECT
   ───────────────────────────────────────── */
function initInputEffects() {
  document.querySelectorAll('.field-input').forEach(input => {
    // Add filled class when input has value
    input.addEventListener('input', () => {
      if (input.value) {
        input.classList.add('filled');
      } else {
        input.classList.remove('filled');
      }
    });

    // Add focus ring effect
    input.addEventListener('focus', () => {
      input.parentElement.classList.add('focused');
    });

    input.addEventListener('blur', () => {
      input.parentElement.classList.remove('focused');
    });
  });
}

/* ─────────────────────────────────────────
   EXPLORE CARDS CLICK (Splash Page - removed)
   ───────────────────────────────────────── */
function initExploreCards() {
  // Splash page removed - function kept for compatibility but does nothing
}

/* ─────────────────────────────────────────
   RIPPLE EFFECT ON BUTTONS
   ───────────────────────────────────────── */

/**
 * Add ripple effect to buttons on click
 */
function initRippleEffect() {
  document.querySelectorAll(
    '.btn-primary, .btn-red, .btn-white, .btn-enroll, .btn-enroll-sm, .auth-btn'
  ).forEach(btn => {
    btn.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255,255,255,0.25);
        border-radius: 50%;
        transform: scale(0);
        animation: rippleAnim 0.5s ease-out forwards;
        pointer-events: none;
      `;

      // Ensure btn has position relative
      if (getComputedStyle(this).position === 'static') {
        this.style.position = 'relative';
      }
      this.style.overflow = 'hidden';
      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });

  // Add ripple keyframes if not already present
  if (!document.getElementById('ripple-style')) {
    const style = document.createElement('style');
    style.id = 'ripple-style';
    style.textContent = `
      @keyframes rippleAnim {
        to { transform: scale(2.5); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

/* ─────────────────────────────────────────
   PAGE LOAD ENTRANCE ANIMATIONS
   ───────────────────────────────────────── */

/**
 * Animate splash page elements on load (removed - no splash page)
 */
function animateSplashEntrance() {
  // Splash page removed - function kept for compatibility but does nothing
}

/* ─────────────────────────────────────────
   CHECK LOGIN STATE
   ───────────────────────────────────────── */

/**
 * Check if user is already logged in (session storage)
 */
function checkLoginState() {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('gids_user') || sessionStorage.getItem('gids_user');
  return !!token && !!user && sessionStorage.getItem('gids_logged_in') === 'true';
}

/**
 * Restore session from a stored auth token when returning to the app.
 */
function restoreSessionFromToken() {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('gids_user');

  if (!token || !user) {
    // Clear stale auth state if incomplete
    clearCurrentUserProfile();
    return false;
  }

  sessionStorage.setItem('gids_logged_in', 'true');
  sessionStorage.setItem('gids_user', user);
  return true;
}

/* ─────────────────────────────────────────
   WINDOW RESIZE HANDLER
   ───────────────────────────────────────── */
function initResizeHandler() {
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Close mobile nav on resize to desktop
      if (window.innerWidth > 640) {
        closeMobileNav();
      }
    }, 200);
  });
}

/* ─────────────────────────────────────────
   ACTIVE NAV HIGHLIGHT ON SCROLL
   ───────────────────────────────────────── */
function initActiveNavOnScroll() {
  // Handled by showPage() — nav links updated on page change
}

/* ─────────────────────────────────────────
   BACKEND API HELPERS
   ───────────────────────────────────────── */

/**
 * Generic API call wrapper
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise}
 */
async function apiCall(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

/* ─────────────────────────────────────────
   TOOLTIPS (optional, for course features)
   ───────────────────────────────────────── */
function initTooltips() {
  const tooltipEls = document.querySelectorAll('[data-tooltip]');
  tooltipEls.forEach(el => {
    el.addEventListener('mouseenter', (e) => {
      const tip = document.createElement('div');
      tip.className = 'gids-tooltip';
      tip.textContent = el.dataset.tooltip;
      tip.style.cssText = `
        position: fixed;
        background: #1a202c;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.78rem;
        font-family: var(--font-ui, sans-serif);
        z-index: 9999;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: 0 4px 14px rgba(0,0,0,0.2);
        top: ${e.clientY - 40}px;
        left: ${e.clientX}px;
        transform: translateX(-50%);
      `;
      document.body.appendChild(tip);
      el._tooltip = tip;
    });

    el.addEventListener('mousemove', (e) => {
      if (el._tooltip) {
        el._tooltip.style.top = (e.clientY - 44) + 'px';
        el._tooltip.style.left = e.clientX + 'px';
      }
    });

    el.addEventListener('mouseleave', () => {
      if (el._tooltip) {
        el._tooltip.remove();
        el._tooltip = null;
      }
    });
  });
}

/* ─────────────────────────────────────────
   FORM VALIDATION VISUAL FEEDBACK
   ───────────────────────────────────────── */
function addFieldValidation(inputId, validatorFn, errorMsg) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('blur', () => {
    if (input.value && !validatorFn(input.value)) {
      input.style.borderColor = '#fca5a5';
      // Show inline error if needed
      let errSpan = input.parentElement.querySelector('.field-err');
      if (!errSpan) {
        errSpan = document.createElement('span');
        errSpan.className = 'field-err';
        errSpan.style.cssText = 'font-size:0.75rem;color:#dc2626;margin-top:3px;display:block;';
        input.parentElement.appendChild(errSpan);
      }
      errSpan.textContent = errorMsg;
    } else {
      input.style.borderColor = '';
      const errSpan = input.parentElement.querySelector('.field-err');
      if (errSpan) errSpan.remove();
    }
  });
}

/* ─────────────────────────────────────────
   TYPING ANIMATION FOR LOGIN PAGE
   ───────────────────────────────────────── */

function typeAuthSidebarText() {
  const textElement = document.getElementById('auth-sidebar-text');
  if (!textElement) return;
  
  const fullText = 'Hey, Hello!';
  let index = 0;
  textElement.textContent = '';
  
  function typeCharacter() {
    if (index < fullText.length) {
      textElement.textContent += fullText[index];
      index++;
      setTimeout(typeCharacter, 120);
    }
  }
  
  typeCharacter();
}

function typeSignupSidebarText() {
  const line1 = document.getElementById('tw-line1');
  const line2 = document.getElementById('tw-line2');
  const line3 = document.getElementById('tw-line3');
  
  if (!line1 || !line2 || !line3) return;

  // Reset all lines and make sure they're visible
  line1.textContent = '';
  line2.textContent = '';
  line3.textContent = '';
  line1.style.visibility = 'visible';
  line2.style.visibility = 'visible';
  line3.style.visibility = 'visible';
  line1.style.width = 'auto';
  line2.style.width = 'auto';
  line3.style.width = 'auto';

  const text1 = 'Glad';
  const text2 = 'To See You';
  const text3 = "Don't Have An Account? Create Your Account, It Take Less Than A Minute";
  
  function typeLine(element, fullText, callback) {
    let index = 0;
    function typeChar() {
      if (index < fullText.length) {
        element.textContent += fullText[index];
        index++;
        setTimeout(typeChar, 80);
      } else if (callback) {
        callback();
      }
    }
    typeChar();
  }

  // Start typing lines one after another
  typeLine(line1, text1, () => {
    typeLine(line2, text2, () => {
      typeLine(line3, text3);
    });
  });
}

/* ─────────────────────────────────────────
   MAIN INIT
   ───────────────────────────────────────── */

/**
 * Main initialization function — runs on DOMContentLoaded
 */
function init() {
  // Initialize all modules
  initNavbarScroll();
  initAdBanners();
  initModalOverlayClose();
  initKeyboardHandlers();
  initSmoothLinks();
  initInputEffects();
  initExploreCards();
  initRippleEffect();
  initResizeHandler();
  initScrollReveal();
  initCounterAnimations();
  initTooltips();

  // Restore session from token if the user returned after email verification
  if (restoreSessionFromToken()) {
    populateUserForms();
    showPage('page-dashboard');
  } else {
    showPage('page-login');
  }

  // Animate splash page
  animateSplashEntrance();

  // Add validation to email fields
  addFieldValidation('su-email', isValidEmail, 'Please enter a valid email address');
  addFieldValidation('enroll-email', isValidEmail, 'Please enter a valid email address');

  console.log('%c🌏 Global India Digital Solution', 'color:#c0392b;font-size:1.1rem;font-weight:bold;');
  console.log('%cPlatform initialized successfully.', 'color:#1a6b5c;font-size:0.9rem;');
}

/* ─────────────────────────────────────────
   DOM READY
   ───────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}










function moveFooterSocialsMobile() {
     document.querySelectorAll('.footer-grid').forEach(grid => {
       const socials = grid.querySelector('.footer-brand .footer-socials');
       if (!socials) return;
       let clone = grid.querySelector('#footer-socials-mobile');
       if (!clone) {
         clone = socials.cloneNode(true);
         clone.id = 'footer-socials-mobile';
         grid.appendChild(clone);
       }
     });
   }
   window.addEventListener('load', moveFooterSocialsMobile);
