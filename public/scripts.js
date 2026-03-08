document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // ==================== ELEMENTS ====================
  const phoneInput = document.getElementById("phone");
  const requestPairingBtn = document.getElementById("requestPairing");
  const statusEl = document.getElementById("status");
  const channelModal = document.getElementById("channelModal");
  const modalClose = document.getElementById("modalClose");
  const confirmFollowBtn = document.getElementById("confirmFollow");
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById('navLinks');
  const nav = document.getElementById('nav');
  const yearSpan = document.getElementById('year');

  // Bot name constant
  const BOT_NAME = "MAD-MAX";

  // Track if user has confirmed following channels
  let channelsFollowed = localStorage.getItem('channelsFollowed') === 'true';

  // ==================== MODAL LOGIC ====================
  // Show channel modal on page load if not already followed
  if (!channelsFollowed) {
    setTimeout(() => {
      channelModal.classList.add('active');
    }, 1000);
  }

  // Close modal function
  function closeModal() {
    channelModal.classList.remove('active');
  }

  modalClose.addEventListener('click', closeModal);

  // Close modal when clicking outside
  channelModal.addEventListener('click', (e) => {
    if (e.target === channelModal) {
      closeModal();
    }
  });

  // Confirm following channels
  confirmFollowBtn.addEventListener('click', () => {
    channelsFollowed = true;
    localStorage.setItem('channelsFollowed', 'true');
    closeModal();
    
    // Show confirmation message
    showStatus(`
      <div class="status-content success">
        <i class="fas fa-check-circle"></i>
        <div>
          <strong>Thank you!</strong>
          <p>You can now proceed to connect your WhatsApp.</p>
        </div>
      </div>
    `, "success");
  });

  // ==================== NAVIGATION ====================
  // Mobile navigation toggle
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const icon = navToggle.querySelector('i');
      if (icon) {
        icon.className = navLinks.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
      }
    });

    // Close mobile menu when clicking on links
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        const icon = navToggle.querySelector('i');
        if (icon) {
          icon.className = 'fas fa-bars';
        }
      });
    });
  }

  // Navbar scroll effect
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        nav.classList.add('nav-scrolled');
      } else {
        nav.classList.remove('nav-scrolled');
      }
    });
  }

  // ==================== STATS UPDATES ====================
  socket.on("statsUpdate", ({ activeSockets, totalUsers }) => {
    document.getElementById("activeSockets").textContent = activeSockets || 0;
    document.getElementById("totalUsers").textContent = totalUsers || 0;
  });

  // ==================== PAIRING LOGIC ====================
  requestPairingBtn.addEventListener("click", async () => {
    // Check if user has followed channels
    if (!channelsFollowed) {
      showStatus(`
        <div class="status-content warning">
          <i class="fas fa-exclamation-triangle"></i>
          <div>
            <strong>Channels Required</strong>
            <p>Please follow all our channels first to use ${BOT_NAME}.</p>
            <button class="btn btn-small" onclick="document.getElementById('channelModal').classList.add('active')">
              <i class="fas fa-bell"></i> View Channels
            </button>
          </div>
        </div>
      `, "warning");
      return;
    }

    const number = phoneInput.value.trim();
    if (!number) {
      showStatus(`
        <div class="status-content error">
          <i class="fas fa-times-circle"></i>
          <div>
            <strong>Phone Number Required</strong>
            <p>Please enter your phone number with country code.</p>
          </div>
        </div>
      `, "error");
      return;
    }

    // Validate phone number format
    const cleanNumber = number.replace(/\D/g, '');
    if (!/^[0-9]{8,15}$/.test(cleanNumber)) {
      showStatus(`
        <div class="status-content error">
          <i class="fas fa-times-circle"></i>
          <div>
            <strong>Invalid Number</strong>
            <p>Please enter a valid phone number (8-15 digits).</p>
          </div>
        </div>
      `, "error");
      return;
    }

    // Show loading state
    requestPairingBtn.disabled = true;
    const originalBtnText = requestPairingBtn.innerHTML;
    requestPairingBtn.innerHTML = '<span class="spinner"></span> Requesting Code...';
    
    showStatus(`
      <div class="status-content loading">
        <span class="spinner"></span>
        <div>
          <strong>Requesting Pairing Code</strong>
          <p>Please wait while we generate your code...</p>
        </div>
      </div>
    `, "loading");

    try {
      const res = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: cleanNumber }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to request pairing");
      }

      const code = (data.pairingCode || "").toString().trim();
      const spacedCode = code.split("").join(" ");
      
      showStatus(`
        <div class="status-content success">
          <i class="fas fa-check-circle"></i>
          <div style="text-align: center; width: 100%;">
            <strong style="font-size: 1.2rem;">✅ Pairing Code Generated!</strong>
            <p style="margin: 15px 0;">For number: <strong>${cleanNumber}</strong></p>
            
            <div class="pairing-code-container">
              <div class="pairing-code" id="pairingCode">${spacedCode}</div>
              <button class="btn btn-small copy-btn" onclick="copyPairingCode('${code}')">
                <i class="fas fa-copy"></i> Copy
              </button>
            </div>
            
            <div class="pairing-instructions">
              <p><i class="fas fa-info-circle"></i> How to use:</p>
              <ol style="text-align: left; margin-top: 10px;">
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Tap "Link a Device"</li>
                <li>Enter this code when prompted</li>
              </ol>
            </div>
            
            <p class="code-expiry"><small>Code expires in 60 seconds</small></p>
          </div>
        </div>
      `, "success");

      // Add copy functionality
      window.copyPairingCode = (code) => {
        navigator.clipboard.writeText(code).then(() => {
          const copyBtn = document.querySelector('.copy-btn');
          const originalText = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
          copyBtn.style.background = 'var(--success)';
          
          setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '';
          }, 2000);
        }).catch(() => {
          showStatus(`
            <div class="status-content error">
              <i class="fas fa-times-circle"></i>
              <div>
                <strong>Copy Failed</strong>
                <p>Please manually copy the code: ${code}</p>
              </div>
            </div>
          `, "error");
        });
      };

    } catch (err) {
      console.error("Pairing request failed", err);
      showStatus(`
        <div class="status-content error">
          <i class="fas fa-times-circle"></i>
          <div>
            <strong>Request Failed</strong>
            <p>${err.message || "Network or server error"}</p>
          </div>
        </div>
      `, "error");
    } finally {
      requestPairingBtn.disabled = false;
      requestPairingBtn.innerHTML = originalBtnText;
    }
  });

  // ==================== STATUS MESSAGE HELPER ====================
  function showStatus(message, type = "") {
    statusEl.innerHTML = message;
    statusEl.className = "status-message";
    if (type) statusEl.classList.add(type);
    statusEl.classList.add("fade-in");

    // Auto-hide success messages after 5 seconds
    if (type === "success") {
      setTimeout(() => {
        statusEl.classList.add("fade-out");
        setTimeout(() => {
          statusEl.innerHTML = '';
          statusEl.className = "status-message";
        }, 500);
      }, 5000);
    }
  }

  // ==================== SOCKET EVENTS ====================
  socket.on("linked", ({ sessionId }) => {
    showStatus(`
      <div class="status-content success">
        <i class="fas fa-check-circle"></i>
        <div style="text-align: center;">
          <strong style="font-size: 1.3rem;">🎉 Successfully Connected!</strong>
          <p style="margin: 15px 0;">Your ${BOT_NAME} bot is now active.</p>
          <div class="success-details">
            <p><i class="fas fa-id-card"></i> Session: ${sessionId}</p>
            <p><i class="fas fa-clock"></i> Connected at: ${new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      </div>
    `, "success");
    
    // Reset the form
    phoneInput.value = "";
  });

  socket.on("unlinked", ({ sessionId }) => {
    showStatus(`
      <div class="status-content warning">
        <i class="fas fa-exclamation-triangle"></i>
        <div>
          <strong>Session Disconnected</strong>
          <p>Your bot has been disconnected. Please reconnect if needed.</p>
        </div>
      </div>
    `, "warning");
  });

  socket.on("pairingTimeout", ({ number }) => {
    showStatus(`
      <div class="status-content warning">
        <i class="fas fa-clock"></i>
        <div>
          <strong>Code Expired</strong>
          <p>The pairing code for ${number} has expired. Please request a new one.</p>
        </div>
      </div>
    `, "warning");
  });

  // ==================== INPUT HANDLING ====================
  // Handle Enter key
  phoneInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      requestPairingBtn.click();
    }
  });

  // Input validation - only numbers
  phoneInput.addEventListener("input", function(e) {
    this.value = this.value.replace(/\D/g, '');
    
    // Add visual feedback
    if (this.value.length > 0) {
      this.classList.add('has-value');
    } else {
      this.classList.remove('has-value');
    }
  });

  // ==================== UTILITIES ====================
  // Set current year
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // Create particle effect
  function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    
    // Clear existing particles
    particlesContainer.innerHTML = '';
    
    const particleCount = window.innerWidth < 768 ? 20 : 40;
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');
      
      // Random properties
      const size = Math.random() * 4 + 1;
      const posX = Math.random() * 100;
      const posY = Math.random() * 100;
      const delay = Math.random() * 20;
      const duration = Math.random() * 15 + 20;
      
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${posX}%`;
      particle.style.top = `${posY}%`;
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationDuration = `${duration}s`;
      
      particlesContainer.appendChild(particle);
    }
  }
  
  createParticles();
  
  // Recreate particles on window resize
  window.addEventListener('resize', () => {
    createParticles();
  });

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Intersection Observer for scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe cards and sections
  document.querySelectorAll('.card, .feature-card, .section-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    observer.observe(el);
  });

  // Add CSS class for iOS detection
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    document.body.classList.add('ios-device');
  }

  // Prevent zoom on input focus for iOS
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    phoneInput.style.fontSize = '16px';
  }

  console.log(`${BOT_NAME} frontend initialized successfully! 🚀`);
});