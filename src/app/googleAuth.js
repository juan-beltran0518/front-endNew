// Helper to integrate with Google Identity Services (GSI) to obtain an ID token (credential)
// Usage:
//  - call initGoogle(clientId) once on app start or before requesting token
//  - call requestIdToken() when user clicks login button; it returns a Promise resolving to the id_token string

let initialized = false;
let pendingResolver = null;
let pendingRejecter = null;
let storedClientId = null;

export function initGoogle(clientId) {
  if (!clientId || typeof window === 'undefined') {
    console.warn('initGoogle: no client ID or not in browser');
    return;
  }
  
  storedClientId = clientId;
  
  // If already initialized, return
  if (initialized) {
    return;
  }
  
  // Wait for GSI to be available
  const waitForGSI = () => {
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => {
            // resp.credential contains the id_token
            if (pendingResolver) {
              pendingResolver(resp.credential);
              pendingResolver = null;
              pendingRejecter = null;
            } else {
              // store temporarily on window for next request
              window.__ids_pending_credential = resp.credential;
            }
          },
          ux_mode: 'popup',
        });
        initialized = true;
      } catch (err) {
        console.error('GSI initialization failed', err);
      }
    } else {
      // GSI not ready yet, check again in 100ms
      setTimeout(waitForGSI, 100);
    }
  };
  
  waitForGSI();
}

export async function requestIdToken({ timeoutMs = 60000 } = {}) {
  // Ensure we have a client ID
  if (!storedClientId) {
    throw new Error('Google client ID not configured. Call initGoogle(clientId) first.');
  }
  
  if (typeof window === 'undefined') {
    throw new Error('Not running in a browser environment');
  }
  
  // Wait for GSI to be initialized
  let attempts = 0;
  while (!initialized && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!initialized) {
    throw new Error('Google Identity Services not ready');
  }
  
  // If a credential was already received by the callback, use it
  if (window.__ids_pending_credential) {
    const token = window.__ids_pending_credential;
    window.__ids_pending_credential = null;
    return token;
  }

  return await new Promise((resolve, reject) => {
    // Setup resolver
    pendingResolver = resolve;
    pendingRejecter = reject;

    // Create a hidden button that will trigger the Google popup
    const container = document.createElement('div');
    container.id = 'hidden-google-button';
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.visibility = 'hidden';
    document.body.appendChild(container);

    try {
      window.google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
      });
      
      // Wait a bit for the button to render, then click it programmatically
      setTimeout(() => {
        const button = container.querySelector('[role="button"]');
        if (button) {
          button.click();
        } else {
          cleanup();
          reject(new Error('Could not find Google Sign-In button'));
        }
      }, 100);
    } catch (err) {
      document.body.removeChild(container);
      pendingResolver = null;
      pendingRejecter = null;
      return reject(err);
    }

    // Cleanup function
    const cleanup = () => {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
      pendingResolver = null;
      pendingRejecter = null;
    };

    const originalResolver = pendingResolver;
    const originalRejecter = pendingRejecter;
    
    pendingResolver = (token) => {
      cleanup();
      originalResolver(token);
    };
    
    pendingRejecter = (err) => {
      cleanup();
      originalRejecter(err);
    };

    setTimeout(() => {
      if (pendingRejecter) {
        pendingRejecter(new Error('Timed out waiting for Google credential'));
      }
    }, timeoutMs);
  });
}
