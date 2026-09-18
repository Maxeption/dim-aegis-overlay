import { t } from './i18n';

interface UpdateCheckResult {
  success: boolean;
  updateAvailable?: boolean;
}

/** Keep the header slot fixed while its button grows left over adjacent actions. */
export function initVersionPill(
  button: HTMLButtonElement,
  version: string,
  checkUpdates: () => Promise<UpdateCheckResult>,
  onUpdateAvailable: () => void,
) {
  const label = button.querySelector<HTMLElement>('.version-label')!;
  const anchor = button.parentElement!.querySelector<HTMLElement>('.version-anchor')!;
  const versionLabel = `v${version}`;
  anchor.textContent = versionLabel;
  label.textContent = versionLabel;
  button.title = t('versionCheckHint');
  let busy = false;
  let request = 0;
  let swapTimer: ReturnType<typeof setTimeout> | undefined;
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function show(text: string, state: string) {
    clearTimeout(swapTimer);
    button.classList.add('version-changing');
    swapTimer = setTimeout(() => {
      label.textContent = text;
      button.dataset.state = state;
      button.style.width = state === 'idle' ? '100%' : `${Math.max(anchor.offsetWidth, Math.ceil(label.scrollWidth + 18))}px`;
      button.classList.remove('version-changing');
      button.title = state === 'idle' ? t('versionCheckHint') : `${text} · ${versionLabel}`;
    }, reducedMotion.matches ? 0 : 100);
  }

  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const currentRequest = ++request;
    clearTimeout(restoreTimer);
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    show(t('versionChecking'), 'checking');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Let the opening animation read even when the background replies immediately.
      const [response] = await Promise.all([
        Promise.race([
          checkUpdates(),
          new Promise<UpdateCheckResult>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Update check timed out')), 15000);
          }),
        ]),
        new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : 350)),
      ]);
      if (currentRequest !== request) return;
      if (!response?.success) throw new Error('Update check failed');
      show(response.updateAvailable ? t('versionAvailable') : t('versionCurrent'), response.updateAvailable ? 'available' : 'current');
      if (response.updateAvailable) onUpdateAvailable();
    } catch {
      if (currentRequest === request) show(t('versionFailed'), 'error');
    } finally {
      clearTimeout(timeout);
      if (currentRequest === request) {
        busy = false;
        button.removeAttribute('aria-busy');
        button.removeAttribute('aria-disabled');
        restoreTimer = setTimeout(() => show(versionLabel, 'idle'), 5000);
      }
    }
  });
}
