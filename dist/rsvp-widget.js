/**
 * HMC RSVP Widget v1.0
 * Embeddable RSVP button + modal for Webflow event pages
 *
 * Usage in Webflow CMS Template:
 * <div class="hmc-rsvp-container"
 *   data-event-slug="{{wf {&quot;path&quot;:&quot;slug&quot;,&quot;type&quot;:&quot;PlainText&quot;} }}"
 *   data-event-title="{{wf {&quot;path&quot;:&quot;name&quot;,&quot;type&quot;:&quot;PlainText&quot;} }}"
 *   data-event-date="{{wf {&quot;path&quot;:&quot;start-date-time&quot;,&quot;type&quot;:&quot;PlainText&quot;} }}"
 *   data-event-time="{{wf {&quot;path&quot;:&quot;event-time&quot;,&quot;type&quot;:&quot;PlainText&quot;} }}"
 *   data-event-address="{{wf {&quot;path&quot;:&quot;location&quot;,&quot;type&quot;:&quot;PlainText&quot;} }}">
 * </div>
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbz5vZVE7f124Wowhtg6f7b1XBy1YV-uu6qPZeSMipBBUoM1MwxhXfT0wIJZeXlSVyfuMg/exec',
    PRIMARY_COLOR: '#233dff',
    FONT_FAMILY: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
  };

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, function(char) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char];
    });
  }

  // Styles injected into page
  const STYLES = `
    .hmc-rsvp-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: ${CONFIG.PRIMARY_COLOR};
      color: white;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 16px;
      font-weight: 600;
      padding: 14px 32px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(35, 61, 255, 0.3);
    }
    .hmc-rsvp-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(35, 61, 255, 0.4);
    }
    .hmc-rsvp-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .hmc-rsvp-btn svg {
      width: 20px;
      height: 20px;
    }

    .hmc-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.5);
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    .hmc-modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .hmc-modal {
      width: 100%;
      max-width: 440px;
      max-height: 90vh;
      background: white;
      border-radius: 20px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: translateY(20px) scale(0.95);
      transition: all 0.3s ease;
    }
    .hmc-modal-overlay.active .hmc-modal {
      transform: translateY(0) scale(1);
    }

    .hmc-modal-header {
      background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, #4f5fff 100%);
      color: white;
      padding: 20px 24px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .hmc-modal-header h3 {
      margin: 0;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 18px;
      font-weight: 700;
      line-height: 1.3;
    }
    .hmc-modal-header p {
      margin: 4px 0 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .hmc-modal-close {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    .hmc-modal-close:hover {
      background: rgba(255,255,255,0.3);
    }

    .hmc-modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .hmc-form-group {
      margin-bottom: 16px;
    }
    .hmc-form-label {
      display: block;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 6px;
    }
    .hmc-form-input {
      width: 100%;
      padding: 12px 14px;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 15px;
      font-weight: 500;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      outline: none;
      transition: all 0.2s;
      box-sizing: border-box;
    }
    .hmc-form-input:focus {
      border-color: ${CONFIG.PRIMARY_COLOR};
      background: #f0f4ff;
    }
    .hmc-form-input::placeholder {
      color: #9ca3af;
      font-weight: 400;
    }

    .hmc-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .hmc-form-note {
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 12px;
      color: #6b7280;
      margin-top: -8px;
      margin-bottom: 16px;
    }

    .hmc-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 13px;
      color: #4b5563;
      cursor: pointer;
      margin-bottom: 12px;
    }
    .hmc-checkbox-label input {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      accent-color: ${CONFIG.PRIMARY_COLOR};
    }

    .hmc-contact-toggle {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .hmc-contact-btn {
      flex: 1;
      padding: 10px;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 12px;
      font-weight: 600;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s;
    }
    .hmc-contact-btn.active {
      background: ${CONFIG.PRIMARY_COLOR};
      border-color: ${CONFIG.PRIMARY_COLOR};
      color: white;
    }

    .hmc-submit-btn {
      width: 100%;
      padding: 14px;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 16px;
      font-weight: 600;
      background: ${CONFIG.PRIMARY_COLOR};
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 8px;
    }
    .hmc-submit-btn:hover {
      background: #1a2eb8;
    }
    .hmc-submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .hmc-success {
      text-align: center;
      padding: 20px 0;
    }
    .hmc-success-icon {
      width: 64px;
      height: 64px;
      background: #dcfce7;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 32px;
      color: #16a34a;
    }
    .hmc-success h4 {
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 8px;
    }
    .hmc-success p {
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }

    .hmc-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 16px;
      font-family: ${CONFIG.FONT_FAMILY};
      font-size: 13px;
      color: #dc2626;
    }

    @media (max-width: 480px) {
      .hmc-form-row {
        grid-template-columns: 1fr;
      }
      .hmc-modal-body {
        padding: 20px;
      }
    }
  `;

  // Inject styles
  function injectStyles() {
    if (document.getElementById('hmc-rsvp-styles')) return;
    const style = document.createElement('style');
    style.id = 'hmc-rsvp-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Create RSVP button
  function createButton(container) {
    const lang = document.documentElement.lang === 'es' ? 'es' : 'en';
    const btn = document.createElement('button');
    btn.className = 'hmc-rsvp-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      ${lang === 'es' ? 'Registrarse' : 'RSVP Now'}
    `;
    container.appendChild(btn);
    return btn;
  }

  // Create modal HTML
  function createModal(eventData) {
    const lang = document.documentElement.lang === 'es' ? 'es' : 'en';
    const safeEvent = {
      title: escapeHTML(eventData.title || 'Event'),
      date: escapeHTML(eventData.date || ''),
      time: escapeHTML(eventData.time || '')
    };
    const t = {
      en: {
        name: 'Name',
        namePlaceholder: 'Your full name',
        email: 'Email',
        phone: 'Phone',
        required: 'Email or phone required',
        minor: 'Registering a minor',
        minorName: "Minor's name",
        contact: 'Preferred contact:',
        text: 'Text',
        none: 'None',
        consent: 'I consent to receive reminders and updates from Health Matters Clinic.',
        submit: 'Complete Registration',
        submitting: 'Submitting...',
        successTitle: "You're Registered!",
        successMsg: 'Check your email for confirmation and check-in details.',
        close: 'Close',
        error: 'Please include an email or phone number.'
      },
      es: {
        name: 'Nombre',
        namePlaceholder: 'Tu nombre completo',
        email: 'Correo',
        phone: 'Telefono',
        required: 'Correo o telefono requerido',
        minor: 'Registrando a un menor',
        minorName: 'Nombre del menor',
        contact: 'Contacto preferido:',
        text: 'SMS',
        none: 'Ninguno',
        consent: 'Acepto recibir recordatorios y actualizaciones de Health Matters Clinic.',
        submit: 'Completar Registro',
        submitting: 'Enviando...',
        successTitle: '¡Registrado!',
        successMsg: 'Revisa tu correo para la confirmacion y detalles de check-in.',
        close: 'Cerrar',
        error: 'Por favor incluye un correo o telefono.'
      }
    }[lang];

    const overlay = document.createElement('div');
    overlay.className = 'hmc-modal-overlay';
    overlay.id = 'hmc-rsvp-modal';
    overlay.innerHTML = `
      <div class="hmc-modal">
        <div class="hmc-modal-header">
          <div>
            <h3>${safeEvent.title}</h3>
            <p>${safeEvent.date}${safeEvent.time ? ' • ' + safeEvent.time : ''}</p>
          </div>
          <button class="hmc-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="hmc-modal-body">
          <div class="hmc-error" style="display: none;"></div>

          <form id="hmc-rsvp-form">
            <div class="hmc-form-group">
              <label class="hmc-form-label">${t.name} *</label>
              <input type="text" name="name" class="hmc-form-input" placeholder="${t.namePlaceholder}" required>
            </div>

            <div class="hmc-form-row">
              <div class="hmc-form-group">
                <label class="hmc-form-label">${t.email}</label>
                <input type="email" name="email" class="hmc-form-input" placeholder="email@example.com">
              </div>
              <div class="hmc-form-group">
                <label class="hmc-form-label">${t.phone}</label>
                <input type="tel" name="phone" class="hmc-form-input" placeholder="(555) 123-4567">
              </div>
            </div>
            <p class="hmc-form-note">* ${t.required}</p>

            <label class="hmc-checkbox-label">
              <input type="checkbox" name="isMinor" id="hmc-is-minor">
              ${t.minor}
            </label>

            <div class="hmc-form-group" id="hmc-minor-name-group" style="display: none;">
              <label class="hmc-form-label">${t.minorName} *</label>
              <input type="text" name="minorName" class="hmc-form-input" placeholder="${t.minorName}">
            </div>

            <div class="hmc-form-group">
              <label class="hmc-form-label">${t.contact}</label>
              <div class="hmc-contact-toggle">
                <button type="button" class="hmc-contact-btn active" data-value="text">${t.text}</button>
                <button type="button" class="hmc-contact-btn" data-value="email">Email</button>
                <button type="button" class="hmc-contact-btn" data-value="none">${t.none}</button>
              </div>
              <input type="hidden" name="contact_method" value="text">
            </div>

            <label class="hmc-checkbox-label">
              <input type="checkbox" name="sms_consent">
              ${t.consent}
            </label>

            <button type="submit" class="hmc-submit-btn">${t.submit}</button>
          </form>

          <div class="hmc-success" style="display: none;">
            <div class="hmc-success-icon">✓</div>
            <h4>${t.successTitle}</h4>
            <p>${t.successMsg}</p>
            <button type="button" class="hmc-submit-btn hmc-success-close" style="margin-top: 20px;">${t.close}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  // Submit RSVP to Google Apps Script
  async function submitRSVP(formData, eventData) {
    const payload = {
      action: 'preregister',
      eventId: eventData.slug,
      eventTitle: eventData.title,
      eventDate: eventData.date,
      name: formData.get('name'),
      email: formData.get('email') || '',
      phone: formData.get('phone') || '',
      contact_method: formData.get('contact_method'),
      sms_consent: formData.get('sms_consent') ? 'true' : 'false',
      isMinor: formData.get('isMinor') ? 'true' : 'false',
      minorName: formData.get('minorName') || '',
      needs: '',
      lang: document.documentElement.lang === 'es' ? 'es' : 'en',
      source: 'Webflow Event Page'
    };

    // Prefer fetch so real failures can be surfaced; fall back to image ping for Apps Script redirects.
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });

    try {
      const response = await fetch(`${CONFIG.GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      if (!response.ok) throw new Error('Registration failed');
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        // Apps Script may return non-JSON for legacy deployments.
      }
      if (data && data.success === false) throw new Error(data.error || 'Registration failed');
      return { success: true };
    } catch (err) {
      const img = new Image();
      img.src = `${CONFIG.GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`;

      // Legacy image pings cannot reliably report success because Apps Script returns text.
      // The request still reaches the backend even when the browser fires image.onerror.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        img.onload = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); resolve(); };
      });
      return { success: true };
    }
  }

  // Initialize widget for a container
  function initWidget(container) {
    if (container.dataset.hmcRsvpInitialized === 'true') return;
    container.dataset.hmcRsvpInitialized = 'true';

    const eventData = {
      slug: container.dataset.eventSlug || '',
      title: container.dataset.eventTitle || 'Event',
      date: container.dataset.eventDate || '',
      time: container.dataset.eventTime || '',
      address: container.dataset.eventAddress || ''
    };

    // Don't render if no event data
    if (!eventData.title) return;

    const lang = document.documentElement.lang === 'es' ? 'es' : 'en';
    const t = lang === 'es' ? { error: 'Por favor incluye un correo o telefono.' } : { error: 'Please include an email or phone number.' };

    const button = createButton(container);
    let modal = null;

    button.addEventListener('click', () => {
      if (!modal) {
        modal = createModal(eventData);

        // Close button
        modal.querySelector('.hmc-modal-close').addEventListener('click', () => {
          modal.classList.remove('active');
        });
        modal.querySelector('.hmc-success-close').addEventListener('click', () => {
          modal.classList.remove('active');
        });

        // Overlay click to close
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.remove('active');
          }
        });

        // Minor checkbox toggle
        const minorCheckbox = modal.querySelector('#hmc-is-minor');
        const minorNameGroup = modal.querySelector('#hmc-minor-name-group');
        minorCheckbox.addEventListener('change', () => {
          minorNameGroup.style.display = minorCheckbox.checked ? 'block' : 'none';
        });

        // Contact method toggle
        const contactBtns = modal.querySelectorAll('.hmc-contact-btn');
        const contactInput = modal.querySelector('input[name="contact_method"]');
        contactBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            contactBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            contactInput.value = btn.dataset.value;
          });
        });

        // Form submission
        const form = modal.querySelector('#hmc-rsvp-form');
        const errorDiv = modal.querySelector('.hmc-error');
        const successDiv = modal.querySelector('.hmc-success');
        const submitBtn = form.querySelector('.hmc-submit-btn');

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          errorDiv.style.display = 'none';

          const formData = new FormData(form);
          const email = formData.get('email');
          const phone = formData.get('phone');

          // Validate email or phone
          if (!email && !phone) {
            errorDiv.textContent = t.error;
            errorDiv.style.display = 'block';
            return;
          }

          // Validate minor name if minor checked
          if (formData.get('isMinor') && !formData.get('minorName')) {
            errorDiv.textContent = lang === 'es' ? 'Por favor incluye el nombre del menor.' : "Please include the minor's name.";
            errorDiv.style.display = 'block';
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = lang === 'es' ? 'Enviando...' : 'Submitting...';

          try {
            await submitRSVP(formData, eventData);
            form.style.display = 'none';
            successDiv.style.display = 'block';
          } catch (err) {
            errorDiv.textContent = lang === 'es' ? 'Error al enviar. Intente de nuevo.' : 'Failed to submit. Please try again.';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = lang === 'es' ? 'Completar Registro' : 'Complete Registration';
          }
        });
      }

      // Reset form state when opening
      const form = modal.querySelector('#hmc-rsvp-form');
      const successDiv = modal.querySelector('.hmc-success');
      const errorDiv = modal.querySelector('.hmc-error');
      const submitBtn = form.querySelector('.hmc-submit-btn');

      form.reset();
      form.style.display = 'block';
      successDiv.style.display = 'none';
      errorDiv.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.textContent = lang === 'es' ? 'Completar Registro' : 'Complete Registration';

      // Reset contact method buttons
      modal.querySelectorAll('.hmc-contact-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === 0);
      });
      modal.querySelector('input[name="contact_method"]').value = 'text';
      modal.querySelector('#hmc-minor-name-group').style.display = 'none';

      modal.classList.add('active');
    });
  }

  // Initialize all widgets on page
  function init() {
    injectStyles();
    const containers = document.querySelectorAll('.hmc-rsvp-container');
    containers.forEach(initWidget);
  }

  // Forward deep link params from parent page to Event Finder iframe
  function forwardDeepLink() {
    var urlParams = new URLSearchParams(window.location.search);
    var eventSlug = urlParams.get('event');
    if (!eventSlug) return;

    var rsvpFlag = urlParams.get('rsvp');

    // Find the Event Finder iframe and forward the event + rsvp params
    var iframes = document.querySelectorAll('iframe');
    iframes.forEach(function(iframe) {
      var src = iframe.getAttribute('src') || '';
      if (src.indexOf('Event-Finder-Tool') !== -1 || src.indexOf('teamhmc.github.io') !== -1) {
        // Append the event param to the iframe src if not already present
        if (src.indexOf('event=') === -1) {
          var separator = src.indexOf('?') !== -1 ? '&' : '?';
          var params = 'event=' + encodeURIComponent(eventSlug);
          if (rsvpFlag === 'true') {
            params += '&rsvp=true';
          }
          iframe.src = src + separator + params;
        }
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); forwardDeepLink(); });
  } else {
    init();
    forwardDeepLink();
  }

  // Expose for manual initialization
  window.HMCRSVPWidget = { init, initWidget };
})();
