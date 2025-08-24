// ✅ Replace with your Groq API key
const GROQ_API_KEY = "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";

// DOM Elements
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const micBtn = document.getElementById("mic-btn");
const fileInput = document.getElementById("file-input");
const newChatBtn = document.querySelector(".new-chat-btn");
const toast = document.getElementById("toast");
const darkModeToggle = document.getElementById("dark-mode-toggle");

// Chat State
let messages = [];
let welcomeRemoved = false;

// Load saved chat
loadChat();

// 🌙 Dark Mode
if (localStorage.getItem("dark-mode") === "true") {
  document.body.classList.add("dark-mode");
  darkModeToggle.checked = true;
}
darkModeToggle.addEventListener("change", () => {
  if (darkModeToggle.checked) {
    document.body.classList.add("dark-mode");
    localStorage.setItem("dark-mode", "true");
  } else {
    document.body.classList.remove("dark-mode");
    localStorage.setItem("dark-mode", "false");
  }
});

// 🎤 Voice Recognition
let recognizing = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
  recognition.continuous = false;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    micBtn.textContent = "🎤";
    recognizing = false;
  };

  recognition.onerror = () => {
    micBtn.textContent = "🎤";
    recognizing = false;
  };

  micBtn.addEventListener("click", () => {
    if (recognizing) {
      recognition.stop();
      micBtn.textContent = "🎤";
      recognizing = false;
    } else {
      recognition.start();
      micBtn.textContent = "🔴";
      recognizing = true;
    }
  });
} else {
  micBtn.style.display = "none";
}

// 📎 File Upload Handler
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    // 🖼️ Image: OCR
    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = event.target.result;
      img.style.maxWidth = "100%";
      img.style.borderRadius = "6px";
      img.style.marginTop = "10px";

      const msg = document.createElement("div");
      msg.className = "message user";
      msg.innerHTML = `<div class="avatar">You</div><div class="content">${file.name}</div>`;
      msg.appendChild(img);
      chatBox.appendChild(msg);
      scrollToBottom();

      const ocrMsg = document.createElement("div");
      ocrMsg.className = "message bot";
      ocrMsg.innerHTML = `<div class="avatar">Q</div><div class="content"><em>Reading text from image...</em></div>`;
      chatBox.appendChild(ocrMsg);
      scrollToBottom();

      Tesseract.recognize(img, 'eng')
        .then(result => {
          const text = result.data.text.trim();
          chatBox.removeChild(ocrMsg);

          if (text) {
            if (detectSensitiveData(text)) {
              addMessageToUI("bot", "Qwen", `I found sensitive data in the image:\n\n${text}\n\n⚠️ **Security Warning**: This appears to be a private key or wallet. Never share this with anyone.`);
            } else {
              addMessageToUI("bot", "Qwen", `I found this text in the image:\n\n"${text}"\n\nYou can now ask me about it.`);
            }
            messages.push({
              role: "user",
              content: `Image "${file.name}" extracted: ${text}`,
              file: { name: file.name, type: "image", extracted_text: text }
            });
          } else {
            addMessageToUI("bot", "Qwen", "No readable text found in the image.");
            messages.push({
              role: "user",
              content: `No text in image: ${file.name}`,
              file: { name: file.name, type: "image" }
            });
          }
        })
        .catch(err => {
          console.error("OCR Error:", err);
          chatBox.removeChild(ocrMsg);
          addMessageToUI("bot", "Qwen", "Failed to read text from image.");
        });
    }

    // 📄 Text File
    else if (file.type === "text/plain") {
      const text = event.target.result;
      addMessageToUI("user", "You", `${file.name}\n${text.substring(0, 200)}...`);
      messages.push({
        role: "user",
        content: `Text file (${file.name}): ${text}`,
        file: { name: file.name, type: "text" }
      });
    }

    // 📄 PDF
    else if (file.type === "application/pdf") {
      const arrayBuffer = event.target.result;
      const loadingTask = pdfjsLib.getDocument({ arrayBuffer });
      loadingTask.promise.then(pdf => {
        let fullText = "";
        const totalPages = Math.min(pdf.numPages, 5);

        let promise = Promise.resolve();
        for (let i = 1; i <= totalPages; i++) {
          promise = promise.then(() => pdf.getPage(i).then(page => page.getTextContent().then(tc => {
            fullText += `\n\nPage ${i}:\n` + tc.items.map(item => item.str).join(" ");
          })));
        }

        promise.then(() => {
          const preview = fullText.substring(0, 500) + "...";
          addMessageToUI("user", "You", `${file.name}\n${preview}`);
          messages.push({
            role: "user",
            content: `PDF (${file.name}): ${fullText}`,
            file: { name: file.name, type: "pdf" }
          });
        });
      }).catch(err => {
        addMessageToUI("user", "You", `PDF: ${file.name} (could not read)`);
        messages.push({
          role: "user",
          content: `PDF: ${file.name}`,
          file: { name: file.name, type: "pdf" }
        });
      });
    }

    // 📊 Excel
    else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      let fullData = "";

      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        fullData += `\n\nSheet: ${sheetName}\n`;
        json.forEach(row => {
          fullData += row.join("\t") + "\n";
        });
      });

      const preview = fullData.substring(0, 500) + "...";
      addMessageToUI("user", "You", `${file.name}\n${preview}`);
      messages.push({
        role: "user",
        content: `Excel (${file.name}):\n${fullData}`,
        file: { name: file.name, type: "excel" }
      });
    }

    // 📎 Other
    else {
      addMessageToUI("user", "You", `📎 ${file.name}`);
      messages.push({
        role: "user",
        content: `Uploaded: ${file.name} (${file.type})`,
        file: { name: file.name, type: "other" }
      });
    }
  };

  // Read file
  if (file.type.startsWith("image/") || file.type === "application/pdf") {
    reader.readAsArrayBuffer(file);
  } else if (file.type === "text/plain") {
    reader.readAsText(file);
  } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsDataURL(file);
  }
});

// 🚀 Send Message
function sendMessage() {
  const userMsg = userInput.value.trim();
  if (!userMsg) return;

  if (!welcomeRemoved) {
    document.querySelector(".welcome")?.remove();
    welcomeRemoved = true;
  }

  addMessageToUI("user", "You", userMsg);
  messages.push({ role: "user", content: userMsg });

  userInput.value = "";

  const thinking = document.createElement("div");
  thinking.className = "message bot";
  thinking.innerHTML = `<div class="avatar">Q</div><div class="content"><em>Thinking...</em></div>`;
  chatBox.appendChild(thinking);
  scrollToBottom();

  fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen/qwen3-32b",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  })
    .then(res => {
      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      return res.json();
    })
    .then(data => {
      const reply = data.choices[0].message.content;
      chatBox.removeChild(thinking);
      addMessageToUI("bot", "Qwen", reply);
      messages.push({ role: "assistant", content: reply });
      saveChat();
    })
    .catch(err => {
      thinking.querySelector(".content").textContent = "Error: " + err.message;
    });
}

// 📧 Add Message to UI
function addMessageToUI(role, sender, text) {
  const msg = document.createElement("div");
  msg.classList.add("message", role);

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = sender[0];

  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = formatMessage(text);

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.textContent = "📋";
  copyBtn.onclick = () => copyText(content.innerText);

  msg.appendChild(avatar);
  msg.appendChild(content);
  msg.appendChild(copyBtn);
  chatBox.appendChild(msg);
  scrollToBottom();
}

// 📝 Format Message
function formatMessage(text) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)\n```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// 📋 Copy to Clipboard
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  });
}

// 📉 Scroll to Bottom
function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

// 🔍 Detect Sensitive Data
function detectSensitiveData(text) {
  const keywords = ["private key", "wallet", "solana", "ethereum", "bitcoin", "password", "secret", "mnemonic"];
  return keywords.some(kw => text.toLowerCase().includes(kw));
}

// 💾 Save Chat
function saveChat() {
  localStorage.setItem("qwen-chat-history", JSON.stringify({ messages, welcomeRemoved }));
}

// 🔁 Load Chat
function loadChat() {
  const saved = localStorage.getItem("qwen-chat-history");
  if (saved) {
    const { messages: savedMessages, welcomeRemoved: savedWelcome } = JSON.parse(saved);
    messages = savedMessages;
    welcomeRemoved = savedWelcome;

    chatBox.innerHTML = "";
    messages.forEach(msg => {
      if (msg.content) {
        const sender = msg.role === "user" ? "You" : "Qwen";
        const role = msg.role === "user" ? "user" : "bot";
        addMessageToUI(role, sender, msg.content);
      }
    });

    if (welcomeRemoved) {
      document.querySelector(".welcome")?.remove();
    }
  }
}

// ➕ New Chat
newChatBtn.addEventListener("click", () => {
  if (confirm("Start a new chat?")) {
    messages = [];
    welcomeRemoved = false;
    chatBox.innerHTML = `
      <div class="message welcome">
        <h2>Qwen3</h2>
        <p>Welcome! I'm powered by <strong>qwen/qwen3-32b</strong>.</p>
      </div>`;
    localStorage.removeItem("qwen-chat-history");
  }
});

// 📤 Export Chat
const exportBtn = document.createElement("button");
exportBtn.id = "export-btn";
exportBtn.title = "Export Chat";
exportBtn.textContent = "📤";
exportBtn.onclick = () => {
  const exportText = messages.map(m => `${m.role.toUpperCase()}:\n${m.content}\n`).join("\n---\n");
  const blob = new Blob([exportText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qwen-chat-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};
document.querySelector(".input-container").appendChild(exportBtn);

// ⏎ Enter to Send
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});