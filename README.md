# 🔐 Secret Codebook: private dictation for Wispr Flow

**Say code words out loud. Your real secrets appear only on your screen.**

Secret Codebook is a small web app that adds a *secret mode* to dictating with [Wispr Flow](https://wisprflow.ai). You dictate with code words, like *“send **project mango** **my usual number**”*. People sitting next to you hear only the code. The app turns your words into the real text, *“send **Acme Robotics Pvt. Ltd.** **+91 98765 43210**”*, on your device, and you paste it wherever you need it.

Built for **No Hands: The Wispr Challenge** by WeMakeDevs × Wispr Flow (Builders track).

---

## The problem

I sit and work with three friends every day. None of them use Wispr Flow, even though it is much faster than typing. The reason: **they don't want the people around them to hear what they're writing**, whether that's client names, phone numbers, salary talk or interview plans. So they go back to typing.

Online reviews of Wispr Flow raise a second privacy worry: dictation is processed in the cloud, and some people don't want sensitive details to leave their device at all.

### What I tried first (and why I dropped it)

My first idea was **noise masking**: the laptop plays a sound while you talk, so the people nearby hear your voice mixed with noise. I tested it and recorded myself on a camera nearby. **My voice was still easy to understand.** Noise only hides speech when it is about as loud as the speech. At that volume it annoys everyone in the room, and it also ruins the audio Wispr hears.

So instead of hiding the *sound*, Secret Codebook hides the *meaning*.

## How it works

```
 You say (people nearby hear this)      Wispr Flow types           Secret Codebook shows (only on your screen)
 ─────────────────────────────────  →   ─────────────────────  →   ─────────────────────────────────────────────
 "send project mango my usual number"   send project mango my      send Acme Robotics Pvt. Ltd. +91 98765 43210
                                        usual number
```

1. **You build a private codebook:** code phrase → secret, for example `project mango` → `Acme Robotics Pvt. Ltd.`
2. **You dictate with Wispr Flow** into the Secret pad, saying code phrases instead of secrets.
3. **The app decodes locally** as you speak. Replaced parts are highlighted, and the output is blurred until you hold *Peek*.
4. **Press ⌘/Ctrl + Enter** to copy the decoded text and clear the pad, then paste it into WhatsApp, Slack, email or anywhere else.

**Privacy you get twice:**
- 👂 **From people nearby:** they hear only “project mango”.
- ☁️ **From the cloud:** the real secret never goes through dictation. Wispr only receives the code word, and the swap happens in your browser.

## Features

- **Live decoding while you dictate**, including text that Wispr inserts without a normal keystroke.
- **Forgiving matching** for how Wispr formats text: any capitalisation (`Project Mango`), punctuation between words (`project-mango`, `Project, mango`), and trailing punctuation.
- **Whole-word matching only:** `mango` won't match inside `mangoes`.
- **Longest phrase wins:** `my usual number` beats `usual number`.
- **Variants with `|`:** `item seven | item 7` covers both ways Wispr might write it.
- **Hindi and Hinglish code words work:** `लाल किताब`, `meetha aam`.
- **Single-pass decoding:** a secret value is never decoded a second time.
- **Discreet view:** the decoded output is blurred so people walking past can't read it. Hold *Peek* to see it.
- **Encrypted codebook:** AES-256-GCM, with the key derived from your passphrase (PBKDF2-SHA256, 600,000 iterations). Only the encrypted version is stored, in your browser.
- **No network access at all:** the page's Content Security Policy sets `connect-src 'none'`, so it cannot send data anywhere even if it tried.
- **Auto-locks** after 5 minutes of inactivity, plus a manual **Lock** button.
- **Encrypted backup** export and restore, to move your codebook to another computer.
- **Warnings for poor code words**, such as phrases made only of everyday words like `send email`.
- No dependencies, no build step and no account. It works on Mac, Windows and phones.

## Quick start

You need a modern browser (Chrome, Edge, Safari or Firefox). Node.js 20+ is needed only to run the tests or the local server.

**Option A: just open it**

Double-click `index.html`. That's it.

**Option B: run the local server**

```bash
npm start
# → Secret Codebook is running at http://localhost:5173
```

**Option C: use the hosted version**

👉 **Live demo:** https://khuswant18.github.io/secret-codebook/

### First run

- Click **Try the demo codebook** to load five sample code words (passphrase `demo1234`), **or**
- Create your own codebook with a passphrase of at least 8 characters.

> ⚠️ **There is no way to recover a forgotten passphrase.** That is the point of the encryption. Export a backup and remember the passphrase.

## Using it with Wispr Flow

1. Install and open **Wispr Flow** on your Mac or Windows PC.
2. Open Secret Codebook and unlock it.
3. Add your code words in the **Codebook** panel. Some ideas:

   | Code phrase you say | Secret it stands for |
   |---|---|
   | `project mango` | Your client's real name |
   | `my usual number` | Your phone number |
   | `home base \| homebase` | Your home address |
   | `code falcon` | “the Zeta Labs interview on Friday at 4 pm” |
   | `the blue file` | “Q3 salary revision sheet” |

4. Click into the **Secret pad**, **hold `fn`** (Wispr's default hotkey on Mac; on Windows it's `Ctrl + Win`) and speak, for example:
   > “Tell code falcon is confirmed and send project mango my usual number.”
5. Let go of the hotkey. Wispr types your words and Secret Codebook decodes them right away.
6. **Hold to peek** to check the result, then press **⌘ + Enter** (Mac) or **Ctrl + Enter** (Windows).
7. Switch to WhatsApp, Slack, Gmail or any other app and **paste** (⌘V / Ctrl+V).

### Choosing good code words

- **Make them unusual.** Pick phrases you would never say by accident: `project mango`, `code falcon`, `meetha aam`. Avoid `send email` or `home`.
- **Use two words or more.** Two-word phrases are rarely said by accident.
- **Add variants.** If Wispr writes `homebase` one day and `home base` another, enter `home base | homebase`. Do the same with numbers: `item seven | item 7`.
- **Test once.** Dictate each new code word once and check Wispr transcribes it the way you expect. If it keeps mishearing a word, add that word to Wispr's personal dictionary.

## How to test it

### 1. Automated unit tests

```bash
npm test
```

There are **29 tests**, run with Node's built-in test runner and no installs. They cover:

| Area | What is checked |
|---|---|
| Normalisation | case, spacing and punctuation; Hindi letters with vowel signs |
| Decoding | basic replacement; capitalisation and punctuation added by Wispr; `project-mango` / `Project, mango` / line breaks; whole words only; longest phrase wins; `\|` variants; repeated codes; no double decoding; regex characters in codes; Hindi and Hinglish codes; highlighted parts; empty input and empty codebook |
| Validation | empty codes or values; codes that are too short; duplicates with different spelling; everyday-word warnings |
| Encryption | round trip; full-strength key derivation; wrong passphrase rejected; tampered data rejected; **no code words or secrets stored in plain text**; re-saving uses a new IV with the same salt; short passphrase rejected; invalid backup files rejected |

Expected output ends with:

```
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

### 2. Manual test in the browser (about 3 minutes)

1. Open `index.html` → click **Try the demo codebook**. You should see **5 code words**.
2. Type or dictate `Tell code falcon is confirmed and send Project Mango my usual number.`
   - The badge shows **3 secrets**.
   - The output is blurred. **Hold to peek** shows:
     *Tell the Zeta Labs interview on Friday at 4 pm is confirmed and send Acme Robotics Pvt. Ltd. +91 98765 43210.*
3. Press **⌘/Ctrl + Enter** → the pad clears. Paste into any text field to check the clipboard.
4. Add a code word `blue moon` → `Rahul from HR`. Type `call blue moon`. It should decode.
5. Try adding `Project-Mango` again → you get the error *“project mango” is used more than once*.
6. Click **Lock** → enter a wrong passphrase → *Wrong passphrase*. Enter `demo1234` → all your code words are back.
7. **Privacy check:** open DevTools → *Application* → *Local Storage*. The stored value is unreadable encrypted text, with no “mango” or “Rahul” in it. In the *Network* tab, no requests are made while you use the app.

### 3. End-to-end test with Wispr Flow (the real one)

1. Sit next to a friend. Dictate a message with two code words into the Secret pad.
2. Ask your friend what they heard. They should only be able to repeat the code words.
3. Check the decoded output has the real values, copy it and send it.
4. Open Wispr Flow → **Insights**. Your dictated words count there.

## Security model and limitations

Being honest about what this does and doesn't protect:

| ✅ Protects | ❌ Doesn't protect |
|---|---|
| Secrets from people **hearing** you | Code words themselves. People hear “project mango”; they just don't know what it means. Don't reuse obvious codes. |
| Secrets from **Wispr's cloud** (only code words are dictated) | Anything you say that **isn't** in your codebook still goes through Wispr as usual. |
| Secrets **at rest** (AES-256-GCM, PBKDF2 600k) | Someone who **reads your screen** while it is unlocked and peeked. Use Discreet view. |
| Secrets from **network leaks** (CSP blocks every request) | Your **clipboard** after copying. Other apps can read it until you copy something else. |
| | A forgotten passphrase: the data **cannot be recovered**. |

The codebook is stored per browser. To use it on another device, **Export encrypted backup** there and **Restore a backup** on the new device.

## Project structure

```
.
├── index.html            # The app (open directly or serve)
├── src/
│   ├── codebook.js       # Core: matching, validation, encryption (shared by app + tests)
│   ├── app.js            # User interface
│   └── styles.css        # Light and dark theme, mobile layout
├── test/
│   └── codebook.test.js  # 29 unit tests (node:test)
├── scripts/
│   └── serve.mjs         # Small local server for `npm start`
└── package.json
```

## Deploy to GitHub Pages

The challenge asks for a link to the working project. This is the easiest way:

```bash
git add .
git commit -m "Secret Codebook: private dictation for Wispr Flow"
git branch -M main
git remote add origin https://github.com/<your-username>/secret-codebook.git
git push -u origin main
```

Then on GitHub, go to **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. After about a minute the app is live at `https://<your-username>.github.io/secret-codebook/`. Put that link in the *Live demo* line above.

## Challenge submission checklist

Deadline: **Saturday 31 October, 11:59 pm IST**.

- [ ] **Project link:** the GitHub repo plus the GitHub Pages live link.
- [ ] **Demo video, up to 2 minutes.** Suggested script:
  1. *(0:00–0:20)* The problem: friends who won't dictate because others can hear.
  2. *(0:20–0:35)* “I tried noise masking first, and it didn't work.” Show the recording clip.
  3. *(0:35–1:30)* Live demo: dictate with Wispr while a friend listens, show the decoded text with Peek, then paste into WhatsApp.
  4. *(1:30–1:50)* Privacy: encrypted codebook, no network access, secrets never sent to the cloud.
  5. *(1:50–2:00)* The `npm test` output showing 29 passing tests, and the link.
- [ ] **Screenshot of your Wispr usage card** (Wispr Flow desktop app → Insights).
- [ ] **Short description:** problem, intended user, and how Wispr was used. Dictate it with Wispr.
- [ ] Bonus: post progress with **#NoHandsChallenge**, tagging WeMakeDevs and Wispr Flow.

## How Wispr Flow was used to build this

- Every prompt to my AI coding assistant was **dictated with Wispr Flow**: the idea, the critique of the noise-masking approach, the research request and the build instructions.
- Commit messages and this project's description were dictated too.
- The product itself is built *for* Wispr Flow users: it makes dictation usable in shared spaces.
