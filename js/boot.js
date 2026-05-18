window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const SIGN_IN_COOLDOWN_MS = 31 * 60 * 1000;
  const TRANSITION_MS = 220;

  const STATES = {
    BOOTING: 'BOOTING',
    SIGNED_OUT: 'SIGNED_OUT',
    UNAUTHORIZED: 'UNAUTHORIZED',
    PROFILE_MISSING: 'PROFILE_MISSING',
    READY: 'READY',
    AUTH_ERROR: 'AUTH_ERROR'
  };

  CR.pendingAuthEmail = CR.pendingAuthEmail || '';
  CR.__bootInFlight = false;

  function root() {
    return document.querySelector('#appRoot');
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function render(content, className = 'boot-stage') {
    const el = root();
    if (!el) return;
    el.innerHTML = `<div class="${className} boot-enter">${content}</div>`;

    window.requestAnimationFrame(() => {
      el.querySelector('.boot-enter')?.classList.add('is-visible');
    });
  }

  async function transitionOutCurrentStage() {
    const currentStage = root()?.firstElementChild;
    if (!currentStage) return;

    currentStage.classList.remove('is-visible');
    currentStage.classList.add('boot-exit');
    await wait(TRANSITION_MS);
  }

  async function swapStage(content, className = 'boot-stage') {
    await transitionOutCurrentStage();
    render(content, className);
  }

  function setAuthStatus(message, tone = '') {
    const status = document.querySelector('#authStatus');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone || '';
  }

  function setButtonLoading(button, isLoading, label) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = label || 'Working…';
      button.disabled = true;
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }

  function getEmailInputValue() {
    return String(document.querySelector('#authEmailInput')?.value || '').trim().toLowerCase();
  }

  function getTokenInputValue() {
    return String(document.querySelector('#authTokenInput')?.value || '').trim();
  }

  async function handleRequestCode() {
    const button = document.querySelector('#authSubmitButton');
    const email = getEmailInputValue();

    if (!email) {
      setAuthStatus('Enter your approved email first.', 'error');
      return;
    }

    const now = Date.now();
    const lastRequest = Number(CR.__lastAuthCodeRequestAt || 0);
    if (lastRequest && now - lastRequest < SIGN_IN_COOLDOWN_MS && CR.pendingAuthEmail === email) {
      await swapStage(CR.authUi.renderTokenStep(email), 'boot-stage auth-stage');
      bindAuthUi();
      setAuthStatus('Use the most recent code we sent.', 'info');
      return;
    }

    try {
      setButtonLoading(button, true, 'Sending…');
      setAuthStatus('Sending your sign-in code…', 'info');

      const { error } = await CR.auth.requestOtp(email);
      if (error) throw error;

      CR.pendingAuthEmail = email;
      CR.__lastAuthCodeRequestAt = Date.now();

      await swapStage(CR.authUi.renderTokenStep(email), 'boot-stage auth-stage');
      bindAuthUi();
      setAuthStatus('Code sent. Check your email.', 'success');
    } catch (error) {
      console.error('Send code failed', error);
      setAuthStatus(error?.message || 'Could not send the sign-in code.', 'error');
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function handleVerifyCode() {
    const button = document.querySelector('#authVerifyButton');
    const email = CR.pendingAuthEmail;
    const token = getTokenInputValue();

    if (!email) {
      await swapStage(CR.authUi.renderSignedOut(), 'boot-stage auth-stage');
      bindAuthUi();
      setAuthStatus('Enter your email again to request a new code.', 'error');
      return;
    }

    if (!token) {
      setAuthStatus('Enter the code from your email.', 'error');
      return;
    }

    try {
      setButtonLoading(button, true, 'Verifying…');
      setAuthStatus('Checking your code…', 'info');

      const { error } = await CR.auth.verifyOtp(email, token);
      if (error) throw error;

      CR.pendingAuthEmail = '';
      await boot();
    } catch (error) {
      console.error('Verify code failed', error);
      setAuthStatus(error?.message || 'Could not verify that code.', 'error');
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function handleSignOut() {
    try {
      await CR.auth.signOut();
    } catch (error) {
      console.error('Auth sign out failed', error);
    }

    CR.pendingAuthEmail = '';
    CR.currentUser = null;
    CR.currentProfile = null;
    CR.currentProfiles = [];
    CR.session = null;
    CR.userSettingsService?.clear?.();
    await boot();
  }

  function bindAuthUi() {
    document.querySelector('#authSubmitButton')?.addEventListener('click', handleRequestCode);
    document.querySelector('#authSignInForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      handleRequestCode();
    });

    document.querySelector('#authVerifyButton')?.addEventListener('click', handleVerifyCode);
    document.querySelector('#authVerifyForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      handleVerifyCode();
    });

    document.querySelector('#authBackButton')?.addEventListener('click', async () => {
      await swapStage(CR.authUi.renderSignedOut(CR.pendingAuthEmail), 'boot-stage auth-stage');
      bindAuthUi();
    });

    document.querySelector('#authSignOutButton')?.addEventListener('click', handleSignOut);
    document.querySelector('#retryBootButton')?.addEventListener('click', boot);
  }

  async function mountShell(useTransition = true) {
    const template = document.querySelector('#appShellTemplate');
    const el = root();

    if (!template || !el) return;

    if (useTransition && root()?.firstElementChild) {
      await transitionOutCurrentStage();
    }

    el.innerHTML = `<div class="app-shell-stage boot-enter">${template.innerHTML}</div>`;

    window.requestAnimationFrame(() => {
      el.querySelector('.app-shell-stage')?.classList.add('is-visible');
    });

    CR.startApp?.();
  }

  async function resolveSessionState() {
    const session = await CR.auth.getSession();

    if (!session?.user) {
      return {
        state: STATES.SIGNED_OUT
      };
    }

    const user = session.user;
    const email = String(user.email || '').trim();
    const allowed = await CR.auth.isAllowedUser(email);

    if (!allowed) {
      return {
        state: STATES.UNAUTHORIZED,
        email
      };
    }

    const [profile, profiles] = await Promise.all([
      CR.auth.loadProfile(user),
      CR.auth.loadActiveProfiles()
    ]);

    if (!profile) {
      return {
        state: STATES.PROFILE_MISSING,
        email
      };
    }

    return {
      state: STATES.READY,
      session,
      user,
      profile,
      profiles
    };
  }

  async function boot() {
    if (CR.__bootInFlight) return;
    CR.__bootInFlight = true;

    try {
      const existingSession = await CR.auth.getSession();
      const hasExistingSession = !!existingSession?.user;

      if (!hasExistingSession) {
        CR.userSettingsService?.clear?.();
        if (!root()?.firstElementChild) {
          render(CR.authUi.renderBoot(), 'boot-stage auth-stage');
        } else {
          await swapStage(CR.authUi.renderBoot(), 'boot-stage auth-stage');
        }
      }

      const resolved = await resolveSessionState();

      switch (resolved.state) {
        case STATES.SIGNED_OUT:
          CR.userSettingsService?.clear?.();
          await swapStage(CR.authUi.renderSignedOut(CR.pendingAuthEmail), 'boot-stage auth-stage');
          bindAuthUi();
          return;

        case STATES.UNAUTHORIZED:
          CR.userSettingsService?.clear?.();
          await swapStage(CR.authUi.renderUnauthorized(resolved.email), 'boot-stage auth-stage');
          bindAuthUi();
          return;

        case STATES.PROFILE_MISSING:
          CR.userSettingsService?.clear?.();
          await swapStage(CR.authUi.renderProfileMissing(resolved.email), 'boot-stage auth-stage');
          bindAuthUi();
          return;

        case STATES.READY: {
          const shellAlreadyMounted = !!document.querySelector('#bottomNav');
          const sameUserAlreadyMounted = shellAlreadyMounted && CR.currentUser?.id === resolved.user.id;

          CR.session = resolved.session;
          CR.currentUser = resolved.user;
          CR.currentProfile = resolved.profile;
          CR.currentProfiles = resolved.profiles || [];

          await CR.userSettingsService?.load?.(resolved.user);

          if (sameUserAlreadyMounted) {
            CR.identity?.applyUserColorVariables?.();
            CR.renderAccountIdentity?.();
            CR.renderManage?.();
            return;
          }

          await mountShell(!hasExistingSession);
          return;
        }

        default:
          throw new Error('Unknown boot state.');
      }
    } catch (error) {
      console.error('Boot failed', error);
      render(CR.authUi.renderAuthError(error?.message), 'boot-stage auth-stage');
      bindAuthUi();
    } finally {
      CR.__bootInFlight = false;
    }
  }

  window.CR.boot = boot;

  document.addEventListener('DOMContentLoaded', async () => {
    await boot();

    try {
      const supabase = await CR.getSupabase();
      let sawInitialAuthCallback = false;

      supabase.auth.onAuthStateChange((event) => {
        if (!sawInitialAuthCallback) {
          sawInitialAuthCallback = true;
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            return;
          }
        }

        boot();
      });
    } catch (error) {
      console.error('Auth listener setup failed', error);
    }
  });
})();
