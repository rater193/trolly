/**
 * Login / register gate shown before the app boots when there is no session.
 * Renders a centered card into #auth-host and calls onAuthed(user) on success.
 */

import { h, clear } from "./utils/dom.js";

export function showAuth(sync, onAuthed) {
  const host = document.getElementById("auth-host");
  let mode = "login"; // or "register"

  function render() {
    clear(host);
    host.classList.add("is-open");

    const error = h("div", { class: "auth__error" });
    const username = h("input", { class: "input", placeholder: "Username", autocomplete: "username" });
    const password = h("input", { class: "input", type: "password", placeholder: "Password",
      autocomplete: mode === "login" ? "current-password" : "new-password" });

    const submitBtn = h("button", { class: "btn btn-primary auth__submit" },
      mode === "login" ? "Log in" : "Create account");

    async function submit() {
      error.textContent = "";
      const u = username.value.trim();
      const p = password.value;
      if (!u || !p) { error.textContent = "Enter a username and password."; return; }
      submitBtn.disabled = true;
      submitBtn.textContent = mode === "login" ? "Logging in…" : "Creating…";
      try {
        const user = mode === "login" ? await sync.login(u, p) : await sync.register(u, p);
        host.classList.remove("is-open");
        clear(host);
        onAuthed(user);
      } catch (e) {
        error.textContent = e.message || "Something went wrong.";
        submitBtn.disabled = false;
        submitBtn.textContent = mode === "login" ? "Log in" : "Create account";
      }
    }

    const onEnter = (e) => { if (e.key === "Enter") submit(); };
    username.addEventListener("keydown", onEnter);
    password.addEventListener("keydown", onEnter);
    submitBtn.addEventListener("click", submit);

    const toggle = h("button", { class: "auth__toggle", onClick: () => {
      mode = mode === "login" ? "register" : "login";
      render();
    } }, mode === "login" ? "No account? Create one" : "Have an account? Log in");

    const card = h("div", { class: "auth__card" }, [
      h("div", { class: "auth__brand" }, "Trolley"),
      h("div", { class: "auth__subtitle" },
        mode === "login" ? "Log in to your shared boards" : "Create an account to get started"),
      h("div", { class: "auth__fields" }, [username, password]),
      error,
      submitBtn,
      toggle,
    ]);

    host.appendChild(card);
    setTimeout(() => username.focus(), 0);
  }

  render();
}
