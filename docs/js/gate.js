import {controleerToegang, isIngelogd, uitloggen} from './github.js?v=20260917-9';

export async function toegang() {
  if (sessionStorage.getItem('park-toegang') !== 'open' && !isIngelogd()) {
    const gate = document.createElement('div');
    gate.className = 'toegang';
    gate.innerHTML = '<section class="panel login"><img src="woordbeeld-groen.png" width="144" alt="het Park">' +
      '<h1 style="font-size:30px;margin-top:24px">Handtekeningen</h1>' +
      '<form><label class="field">Wachtwoord<input type="password" required autocomplete="current-password"></label>' +
      '<button>Open handtekeningen</button></form><p class="status" role="status"></p></section>';
    document.body.append(gate);
    await new Promise(resolve => gate.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = gate.querySelector('button'); button.disabled = true;
      try {
        await controleerToegang(gate.querySelector('input').value);
        gate.remove(); resolve();
      } catch (e) { gate.querySelector('.status').textContent = e.message; }
      finally { button.disabled = false; }
    }));
  }
  document.documentElement.removeAttribute('data-locked');
  const nav = document.querySelector('.topbar nav');
  if (nav) {
    const button = document.createElement('button');
    button.id = 'uitloggen';
    button.className = 'secondary small'; button.textContent = 'Log uit';
    button.addEventListener('click', () => {
      if (!window.dispatchEvent(new Event('park-uitloggen', {cancelable:true}))) return;
      sessionStorage.removeItem('park-toegang'); uitloggen(); location.reload();
    });
    nav.append(button);
  }
}
