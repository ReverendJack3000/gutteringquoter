# ServiceM8 OAuth 2.0 Implementation Guide

This guide shows how to implement the ServiceM8 OAuth flow in the Quote App frontend.

## Overview

The backend OAuth endpoints are already implemented:
- `GET /api/servicem8/oauth/authorize` - Starts OAuth flow (requires auth)
- `GET /api/servicem8/oauth/callback` - ServiceM8 redirects here with code
- `GET /api/servicem8/oauth/status` - Check if user has connected ServiceM8
- `POST /api/servicem8/oauth/disconnect` - Remove ServiceM8 connection

## Step 1: Add "Connect ServiceM8" UI

Add a menu item in the profile dropdown (in `index.html`):

```html
<!-- In profile dropdown, after Product Management -->
<div class="profile-menu-item" id="menuItemServiceM8" role="menuitem">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
  <span id="servicem8MenuText">Connect ServiceM8</span>
</div>
```

## Step 2: Check Connection Status on Load

Add this function to `app.js`:

```javascript
/**
 * Check if user has connected ServiceM8 account.
 * Updates UI to show "Connect" or "Disconnect" accordingly.
 */
async function checkServiceM8Status() {
  if (!authState.token) {
    // Not logged in, hide ServiceM8 menu item
    const menuItem = document.getElementById('menuItemServiceM8');
    if (menuItem) menuItem.style.display = 'none';
    return;
  }

  try {
    const resp = await fetch('/api/servicem8/oauth/status', {
      headers: {
        'Authorization': `Bearer ${authState.token}`,
      },
    });
    const data = await resp.json();
    const menuText = document.getElementById('servicem8MenuText');
    if (menuText) {
      menuText.textContent = data.connected ? 'Disconnect ServiceM8' : 'Connect ServiceM8';
    }
    // Store status for later use
    window.servicem8Connected = data.connected || false;
  } catch (e) {
    console.error('Failed to check ServiceM8 status:', e);
    window.servicem8Connected = false;
  }
}
```

## Step 3: Handle Connect/Disconnect Click

Add event listener in your initialization code (where other menu items are wired):

```javascript
// In initAuth() or similar initialization function
const menuItemServiceM8 = document.getElementById('menuItemServiceM8');
if (menuItemServiceM8) {
  menuItemServiceM8.addEventListener('click', async () => {
    if (!authState.token) {
      alert('Please sign in first');
      return;
    }

    if (window.servicem8Connected) {
      // Disconnect
      if (confirm('Disconnect ServiceM8 account?')) {
        try {
          const resp = await fetch('/api/servicem8/oauth/disconnect', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authState.token}`,
            },
          });
          if (resp.ok) {
            window.servicem8Connected = false;
            const menuText = document.getElementById('servicem8MenuText');
            if (menuText) menuText.textContent = 'Connect ServiceM8';
            showToolbarMessage('ServiceM8 disconnected', 'success');
          }
        } catch (e) {
          console.error('Disconnect failed:', e);
          showToolbarMessage('Failed to disconnect ServiceM8', 'error');
        }
      }
    } else {
      // Connect - redirect to authorize endpoint
      window.location.href = '/api/servicem8/oauth/authorize';
    }
  });
}
```

## Step 4: Handle OAuth Callback Redirect

ServiceM8 redirects back to `/api/servicem8/oauth/callback?code=...&state=...`, which then redirects to `/?servicem8=connected` or `/?servicem8=error`.

Add this on page load (in your initialization):

```javascript
// Check URL params for OAuth callback result
const urlParams = new URLSearchParams(window.location.search);
const servicem8Result = urlParams.get('servicem8');
if (servicem8Result === 'connected') {
  showToolbarMessage('ServiceM8 connected successfully!', 'success');
  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);
  // Refresh status
  checkServiceM8Status();
} else if (servicem8Result === 'error') {
  showToolbarMessage('ServiceM8 connection failed. Please try again.', 'error');
  window.history.replaceState({}, '', window.location.pathname);
}
```

## Step 5: Enable ServiceM8 Section in Quote Modal

Update `updateServiceM8SectionState()` in `app.js` to check connection status:

```javascript
function updateServiceM8SectionState(hasIncomplete) {
  const section = document.getElementById('quoteServicem8Section');
  const input = document.getElementById('servicem8JobIdInput');
  const btn = document.getElementById('servicem8AddToJobBtn');
  
  // Disable if manual entries incomplete OR ServiceM8 not connected
  const shouldDisable = hasIncomplete || !window.servicem8Connected;
  
  if (section) {
    if (shouldDisable) {
      section.classList.add('quote-servicem8-section--disabled');
      if (input) input.disabled = true;
      if (btn) btn.disabled = true;
    } else {
      section.classList.remove('quote-servicem8-section--disabled');
      if (input) input.disabled = false;
      if (btn) btn.disabled = false;
      updateServicem8InputState();
    }
  }
}
```

## Step 6: Call Status Check After Login

Update your login success handler to check ServiceM8 status:

```javascript
// After successful login (in your auth success handler)
async function onAuthSuccess() {
  // ... existing login code ...
  
  // Check ServiceM8 connection status
  await checkServiceM8Status();
  
  // Show menu item if logged in
  const menuItem = document.getElementById('menuItemServiceM8');
  if (menuItem) menuItem.style.display = 'block';
}
```

## Step 7: Wire "Add to Job" Button (Future)

When implementing task 49.21, use the stored access token to call ServiceM8 API:

```javascript
async function addMaterialsToJob(jobId, materials) {
  // Get access token from backend (it handles refresh automatically)
  const resp = await fetch('/api/servicem8/job-materials', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authState.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_id: jobId,
      materials: materials,
    }),
  });
  // Handle response...
}
```

## Complete Example: Integration Points

### In `app.js`, add these functions:

```javascript
// ServiceM8 OAuth status check
async function checkServiceM8Status() {
  if (!authState.token) {
    const menuItem = document.getElementById('menuItemServiceM8');
    if (menuItem) menuItem.style.display = 'none';
    return;
  }

  try {
    const resp = await fetch('/api/servicem8/oauth/status', {
      headers: { 'Authorization': `Bearer ${authState.token}` },
    });
    const data = await resp.json();
    const menuText = document.getElementById('servicem8MenuText');
    if (menuText) {
      menuText.textContent = data.connected ? 'Disconnect ServiceM8' : 'Connect ServiceM8';
    }
    window.servicem8Connected = data.connected || false;
    
    // Update quote modal ServiceM8 section state
    updateServiceM8SectionState(/* check for incomplete entries */);
  } catch (e) {
    console.error('ServiceM8 status check failed:', e);
    window.servicem8Connected = false;
  }
}

// Initialize ServiceM8 menu item
function initServiceM8Menu() {
  const menuItem = document.getElementById('menuItemServiceM8');
  if (!menuItem) return;

  menuItem.addEventListener('click', async () => {
    if (!authState.token) {
      showToolbarMessage('Please sign in first', 'error');
      return;
    }

    if (window.servicem8Connected) {
      // Disconnect
      if (!confirm('Disconnect ServiceM8 account?')) return;
      try {
        const resp = await fetch('/api/servicem8/oauth/disconnect', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authState.token}` },
        });
        if (resp.ok) {
          window.servicem8Connected = false;
          const menuText = document.getElementById('servicem8MenuText');
          if (menuText) menuText.textContent = 'Connect ServiceM8';
          showToolbarMessage('ServiceM8 disconnected', 'success');
          updateServiceM8SectionState(/* check incomplete */);
        }
      } catch (e) {
        showToolbarMessage('Failed to disconnect', 'error');
      }
    } else {
      // Connect - redirect to authorize
      window.location.href = '/api/servicem8/oauth/authorize';
    }
  });
}

// Check for OAuth callback on page load
function checkOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('servicem8');
  if (result === 'connected') {
    showToolbarMessage('ServiceM8 connected successfully!', 'success');
    window.history.replaceState({}, '', window.location.pathname);
    checkServiceM8Status();
  } else if (result === 'error') {
    showToolbarMessage('ServiceM8 connection failed', 'error');
    window.history.replaceState({}, '', window.location.pathname);
  }
}
```

### Call these in your initialization:

```javascript
// On page load
document.addEventListener('DOMContentLoaded', () => {
  // ... existing init code ...
  
  initServiceM8Menu();
  checkOAuthCallback();
  
  // After login success
  // ... in your auth success handler ...
  checkServiceM8Status();
});
```

## Testing the Flow

1. **Sign in** to the app
2. **Click "Connect ServiceM8"** in profile menu → redirects to ServiceM8
3. **Authorize** in ServiceM8 → redirects back to app with `?servicem8=connected`
4. **Verify** menu shows "Disconnect ServiceM8"
5. **Open quote modal** → ServiceM8 section should be enabled (if no incomplete entries)
6. **Click "Disconnect"** → removes connection, menu shows "Connect ServiceM8" again

## Troubleshooting

- **"ServiceM8 OAuth not configured"**: Check `SERVICEM8_APP_ID` and `SERVICEM8_APP_SECRET` in Railway/env
- **Redirect doesn't work**: Ensure `APP_BASE_URL` matches Railway URL
- **Token refresh fails**: Check Railway logs for ServiceM8 API errors
- **Menu item not showing**: Ensure user is logged in (`authState.token` exists)
