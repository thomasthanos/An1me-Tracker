document.addEventListener("DOMContentLoaded", () => {
  const post = (msg) => {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.controller) {
      window.webkit.messageHandlers.controller.postMessage(msg);
    }
  };

  const settingsBtn = document.getElementById("openSettingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => post("open-settings"));
  }

  const webBtn = document.getElementById("openWebBtn");
  if (webBtn) {
    webBtn.addEventListener("click", () => post("open-url:https://an1me.to"));
  }

  const ghBtn = document.getElementById("openGithubBtn");
  if (ghBtn) {
    ghBtn.addEventListener("click", () => post("open-url:https://github.com/thomasthanos/an1me-extensions"));
  }
});
