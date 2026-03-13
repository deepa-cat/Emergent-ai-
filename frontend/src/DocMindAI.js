import { useState, useRef, useEffect } from "react";
import * as mammoth from "mammoth";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_URL = `${BACKEND_URL}/api/chat`;
const TTS_URL = `${BACKEND_URL}/api/tts`;

const SYSTEM_PROMPT = `You are "DocMind AI" - a smart document assistant that reads uploaded files and answers questions.
CAPABILITIES: Summarize, Q&A, Translate to any language, Key Points, Explain Simply.
RULES:
- Base answers ONLY on the provided document content
- If info is not in the document, say so clearly
- Reply in the same language the user writes in
- Be helpful for both Students and Business users`;

const UI_TEXT = {
  en: {
    title: "DocMind AI", subtitle: "Smart Document Processor",
    uploadTab: "📂 Upload", chatTab: "💬 Chat", docsTab: "📁 Docs",
    chooseFile: "📁 Choose File", dropHere: "or drag & drop here",
    noDoc: "No Documents Yet", noDocSub: "Upload documents to get started",
    goUpload: "📂 Go to Upload", ready: "Ready",
    askPlaceholder: "Ask anything about the documents...",
    uploadFirst: "Upload a document first...",
    processing: "Processing...", poweredBy: "Powered by Claude AI 🧠",
    quickActions: "⚡ Quick Actions", loadedDocs: "Loaded Documents",
    downloadPDF: "⬇ Download as PDF", clearAll: "Clear All",
    listening: "Listening...", voiceError: "Voice not supported",
    summarize: "Summarize", keyPoints: "Key Points",
    tamilTranslate: "Tamil Translate", hindiTranslate: "Hindi Translate",
    explainSimply: "Explain Simply", qaMode: "Q&A Mode",
  },
  ta: {
    title: "DocMind AI", subtitle: "ஸ்மார்ட் ஆவண செயலி",
    uploadTab: "📂 பதிவேற்று", chatTab: "💬 அரட்டை", docsTab: "📁 கோப்புகள்",
    chooseFile: "📁 கோப்பு தேர்வு", dropHere: "அல்லது இங்கே இழுக்கவும்",
    noDoc: "ஆவணங்கள் இல்லை", noDocSub: "தொடங்க ஆவணங்களை பதிவேற்றவும்",
    goUpload: "📂 பதிவேற்றுக்கு செல்", ready: "தயார்",
    askPlaceholder: "ஆவணங்களைப் பற்றி கேளுங்க...",
    uploadFirst: "முதலில் ஆவணம் பதிவேற்றவும்...",
    processing: "செயலாக்கம்...", poweredBy: "Claude AI ஆல் இயக்கப்படுகிறது 🧠",
    quickActions: "⚡ விரைவு செயல்கள்", loadedDocs: "ஏற்றப்பட்ட ஆவணங்கள்",
    downloadPDF: "⬇ PDF தரவிறக்கம்", clearAll: "அனைத்தும் நீக்கு",
    listening: "கேட்கிறேன்...", voiceError: "குரல் ஆதரவு இல்லை",
    summarize: "சுருக்கம்", keyPoints: "முக்கிய புள்ளிகள்",
    tamilTranslate: "தமிழில் மொழிபெயர்", hindiTranslate: "இந்தியில் மொழிபெயர்",
    explainSimply: "எளிமையாக விளக்கு", qaMode: "கேள்வி-பதில் முறை",
  }
};

const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    resolve(window.pdfjsLib);
  };
  s.onerror = reject;
  document.head.appendChild(s);
});

const extractPdfText = async (file) => {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += `\n[Page ${i}]\n${content.items.map(x => x.str).join(" ")}\n`;
  }
  return text.trim();
};

const TypingDots = () => (
  <div style={{ display: "flex", gap: 5, padding: "12px 16px", alignItems: "center" }}>
    {[0,1,2].map(i => (
      <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "linear-gradient(135deg,#06b6d4,#3b82f6)", animation: "tdot 1.3s infinite", animationDelay: `${i*0.22}s` }} />
    ))}
  </div>
);

export default function DocMindAI() {
  const [docs, setDocs] = useState([]); // [{name, text, info, id}]
  const [activeDocIds, setActiveDocIds] = useState([]); // which docs are selected for chat
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [tab, setTab] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [lang, setLang] = useState("en");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null); // Store current audio object
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const T = UI_TEXT[lang];
  const docReady = activeDocIds.length > 0;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const getQuickActions = () => [
    { label: T.summarize, icon: "📋", prompt: "Give me a comprehensive summary of the document(s)." },
    { label: T.keyPoints, icon: "🎯", prompt: "List all the key points from the document(s)." },
    { label: T.tamilTranslate, icon: "🔤", prompt: "Translate the main content to Tamil." },
    { label: T.hindiTranslate, icon: "🇮🇳", prompt: "Translate the main content to Hindi." },
    { label: T.explainSimply, icon: "💡", prompt: "Explain the document(s) in very simple language." },
    { label: T.qaMode, icon: "❓", prompt: "Generate important Q&A pairs from the document(s)." },
  ];

  const processFile = async (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    setProcessing(true);
    setProcessingMsg(T.processing);
    try {
      let text = "";
      if (ext === "pdf") {
        setProcessingMsg("📄 Reading PDF...");
        text = await extractPdfText(file);
      } else if (ext === "docx") {
        setProcessingMsg("📝 Reading DOCX...");
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        text = result.value;
      } else if (["txt","md","csv","json","html","xml"].includes(ext)) {
        setProcessingMsg("📃 Reading file...");
        text = await file.text();
      } else {
        setProcessing(false);
        return;
      }
      if (!text?.trim()) throw new Error("No text extracted");
      const id = Date.now() + Math.random();
      const newDoc = { id, name: file.name, text, info: `${ext.toUpperCase()} · ${sizeMB}MB · ${text.length.toLocaleString()} chars` };
      setDocs(prev => [...prev, newDoc]);
      setActiveDocIds(prev => [...prev, id]);
      setMessages(prev => [...prev, { role: "system", content: `✅ "${file.name}" loaded! ${text.length.toLocaleString()} chars ready.` }]);
      setTab("chat");
    } catch (err) {
      setMessages(prev => [...prev, { role: "system", content: `❌ Error: ${err.message}` }]);
    }
    setProcessing(false);
    setProcessingMsg("");
  };

  const handleFileChange = (e) => {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    Array.from(e.dataTransfer.files || []).forEach(processFile);
  };

  const toggleDoc = (id) => {
    setActiveDocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const removeDoc = (id) => {
    setDocs(prev => prev.filter(d => d.id !== id));
    setActiveDocIds(prev => prev.filter(x => x !== id));
  };

  const clearAll = () => { setDocs([]); setActiveDocIds([]); setMessages([]); setTab("upload"); };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { 
      // Silently fail or show non-intrusive message
      console.log("Voice input not supported in this browser");
      return; 
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    try {
      const rec = new SR();
      rec.lang = lang === "ta" ? "ta-IN" : "en-US";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setListening(true);
      rec.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        setInput(transcript);
        setListening(false);
      };
      rec.onerror = (e) => {
        console.error("Voice error:", e.error);
        setListening(false);
      };
      rec.onend = () => setListening(false);
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      setListening(false);
      console.error("Voice error:", err);
    }
  };

  const speakText = async (text) => {
    try {
      // If already speaking, stop
      if (speaking && currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        setSpeaking(false);
        setCurrentAudio(null);
        return;
      }

      setSpeaking(true);

      // Call backend TTS API
      const response = await axios.post(TTS_URL, {
        text: text.substring(0, 4096), // Limit to 4096 chars
        voice: "nova",
        speed: 1.0
      });

      if (response.data.error) {
        console.error("TTS error:", response.data.error);
        alert("Speech generation failed. Please try again.");
        setSpeaking(false);
        return;
      }

      // Convert base64 to audio blob for better compatibility
      const audioBase64 = response.data.audio;
      const binaryString = window.atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setSpeaking(false);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        alert("Audio playback failed. Please check your device volume and try again.");
        setSpeaking(false);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      setCurrentAudio(audio);
      
      // Try to play with better error handling
      try {
        await audio.play();
      } catch (playError) {
        console.error("Play error:", playError);
        alert("Cannot play audio. Please make sure your device isn't in silent mode and try again.");
        setSpeaking(false);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      }

    } catch (error) {
      console.error("TTS error:", error);
      alert("Failed to generate speech: " + error.message);
      setSpeaking(false);
      setCurrentAudio(null);
    }
  };

  const downloadPDF = () => {
    const lastAI = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAI) return;
    const content = lastAI.content;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DocMind AI Answer</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#1a1a1a}
    h1{color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:10px}
    pre{white-space:pre-wrap;word-break:break-word}</style></head>
    <body><h1>DocMind AI — Answer</h1><p><strong>Documents:</strong> ${docs.filter(d=>activeDocIds.includes(d.id)).map(d=>d.name).join(", ")}</p>
    <hr/><pre>${content}</pre><p style="color:#888;font-size:12px;margin-top:40px">Generated by DocMind AI · Powered by Claude</p>
    </body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "docmind-answer.html"; a.click();
    URL.revokeObjectURL(url);
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading || !docReady) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    const activeDocs = docs.filter(d => activeDocIds.includes(d.id));
    const docContext = activeDocs.map(d => `--- DOCUMENT: "${d.name}" ---\n${d.text.slice(0, 20000)}\n--- END ---`).join("\n\n");
    const history = newMessages.filter(m => m.role === "user" || m.role === "assistant");
    
    try {
      const res = await axios.post(API_URL, {
        messages: history,
        document_context: docContext,
        session_id: `docmind-${Date.now()}`
      }, {
        timeout: 60000 // 60 second timeout for AI responses
      });
      
      const reply = res.data.response || res.data.error || "Sorry, try again.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (error) {
      console.error("Chat error:", error);
      let errorMsg = "❌ Connection error. Please try again.";
      if (error.code === 'ECONNABORTED') {
        errorMsg = "⏱️ Request timed out. The AI is taking longer than usual. Please try again.";
      } else if (error.response) {
        errorMsg = `❌ Error: ${error.response.data?.error || error.response.statusText}`;
      } else if (error.request) {
        errorMsg = "❌ Network error. Please check your connection and try again.";
      }
      setMessages([...newMessages, { role: "assistant", content: errorMsg }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const hasAIReply = messages.some(m => m.role === "assistant");

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", minHeight: "100vh", background: "#060b14", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes tdot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-7px);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(6,182,212,0.3)}50%{box-shadow:0 0 40px rgba(6,182,212,0.6)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes ripple{0%{transform:scale(1);opacity:1}100%{transform:scale(2.5);opacity:0}}
        .msg{animation:fadeUp 0.3s ease}
        .qa-btn:hover{background:rgba(6,182,212,0.18)!important;border-color:#06b6d4!important;transform:translateY(-2px)}
        .send-btn:hover{filter:brightness(1.2);transform:scale(1.06)}
        .upload-zone:hover{border-color:rgba(6,182,212,0.6)!important;background:rgba(6,182,212,0.06)!important}
        .doc-card:hover{border-color:rgba(6,182,212,0.4)!important}
        textarea:focus{outline:none}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
      `}</style>

      <div style={{ width: "100%", maxWidth: 740, height: "93vh", maxHeight: 840, display: "flex", flexDirection: "column", background: "linear-gradient(160deg,#0d1829 0%,#060b14 100%)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.7),inset 0 1px 0 rgba(6,182,212,0.1)" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", background: "rgba(6,182,212,0.04)", borderBottom: "1px solid rgba(6,182,212,0.12)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#06b6d4,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, animation: "glow 3s infinite", flexShrink: 0 }}>🧠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, background: "linear-gradient(90deg,#06b6d4,#3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{T.title}</div>
            <div style={{ color: "#475569", fontSize: 11 }}>{T.subtitle} {docs.length > 0 ? `· ${docs.length} doc${docs.length>1?"s":""}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => setLang(l => l === "en" ? "ta" : "en")} style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.25)", borderRadius: 8, padding: "5px 10px", color: "#06b6d4", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {lang === "en" ? "தமிழ்" : "EN"}
            </button>
            {docs.length > 0 && <button onClick={clearAll} style={{ background: "none", border: "1px solid rgba(100,116,139,0.3)", borderRadius: 8, padding: "5px 10px", color: "#64748b", fontSize: 11, cursor: "pointer" }}>{T.clearAll}</button>}
            {hasAIReply && <button onClick={downloadPDF} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "5px 10px", color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{T.downloadPDF}</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(6,182,212,0.1)", padding: "0 20px", background: "rgba(6,10,20,0.5)" }}>
          {[["upload", T.uploadTab], ["docs", T.docsTab], ["chat", T.chatTab]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "9px 14px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #06b6d4" : "2px solid transparent", color: tab === t ? "#06b6d4" : "#475569", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: -1, position: "relative" }}>
              {label}
              {t === "docs" && docs.length > 0 && <span style={{ position: "absolute", top: 6, right: 4, width: 16, height: 16, borderRadius: "50%", background: "#06b6d4", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{docs.length}</span>}
            </button>
          ))}
          {docReady && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, color: "#22c55e", fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              {T.ready}
            </div>
          )}
        </div>

        {/* Upload Tab */}
        {tab === "upload" && (
          <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            {processing ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <div style={{ width: 46, height: 46, border: "4px solid rgba(6,182,212,0.2)", borderTopColor: "#06b6d4", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
                <div style={{ color: "#06b6d4", fontSize: 14, fontWeight: 600 }}>{processingMsg}</div>
              </div>
            ) : (
              <>
                <div className="upload-zone" onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                  style={{ border: `2px dashed ${dragOver ? "#06b6d4" : "rgba(6,182,212,0.25)"}`, borderRadius: 18, padding: "28px 20px", textAlign: "center", background: dragOver ? "rgba(6,182,212,0.08)" : "transparent", transition: "all 0.25s" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
                  <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Upload your document(s)</div>
                  <div style={{ color: "#475569", fontSize: 12, marginBottom: 18 }}>PDF · DOCX · TXT · MD · CSV · Multiple files OK!</div>
                  <label style={{ display: "inline-block", cursor: "pointer" }}>
                    <input type="file" accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.xml" onChange={handleFileChange} multiple style={{ display: "none" }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#06b6d4,#3b82f6)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "13px 30px", borderRadius: 12, boxShadow: "0 6px 24px rgba(6,182,212,0.4)", cursor: "pointer" }}>
                      {T.chooseFile}
                    </span>
                  </label>
                  <div style={{ marginTop: 12, color: "#334155", fontSize: 12 }}>{T.dropHere}</div>
                </div>

                <div style={{ background: "rgba(6,182,212,0.04)", border: "1px solid rgba(6,182,212,0.12)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ color: "#06b6d4", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>✅ Supported Formats</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[["📄 PDF", "Books, reports, papers"], ["📝 DOCX", "Word documents"], ["📃 TXT/MD", "Text, markdown"], ["📊 CSV/JSON", "Data files"]].map(([f, d]) => (
                      <div key={f} style={{ background: "rgba(13,24,41,0.6)", borderRadius: 9, padding: "9px 12px" }}>
                        <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{f}</div>
                        <div style={{ color: "#475569", fontSize: 11 }}>{d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Docs Tab */}
        {tab === "docs" && (
          <div style={{ flex: 1, padding: 18, overflowY: "auto" }}>
            {docs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
                <div style={{ fontSize: 60, opacity: 0.3 }}>📁</div>
                <div style={{ color: "#475569", fontSize: 16, fontWeight: 600 }}>{T.noDoc}</div>
                <div style={{ color: "#334155", fontSize: 13, marginBottom: 8 }}>{T.noDocSub}</div>
                <button onClick={() => setTab("upload")} style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {T.goUpload}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ color: "#06b6d4", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{T.loadedDocs}</div>
                {docs.map(doc => (
                  <div key={doc.id} className="doc-card" style={{ background: "rgba(13,24,41,0.6)", border: `1px solid ${activeDocIds.includes(doc.id) ? "rgba(6,182,212,0.4)" : "rgba(100,116,139,0.2)"}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s" }}>
                    <input type="checkbox" checked={activeDocIds.includes(doc.id)} onChange={() => toggleDoc(doc.id)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                      <div style={{ color: "#475569", fontSize: 11 }}>{doc.info}</div>
                    </div>
                    <button onClick={() => removeDoc(doc.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat Tab */}
        {tab === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.length === 0 && !docReady && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
                  <div style={{ fontSize: 50, opacity: 0.3 }}>💬</div>
                  <div style={{ color: "#475569", fontSize: 14, textAlign: "center" }}>{T.uploadFirst}</div>
                  <button onClick={() => setTab("upload")} style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {T.goUpload}
                  </button>
                </div>
              )}
              
              {messages.length === 0 && docReady && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#06b6d4", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{T.quickActions}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {getQuickActions().map((action, i) => (
                      <button key={i} onClick={() => sendMessage(action.prompt)} className="qa-btn" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 10, padding: "12px", textAlign: "left", cursor: "pointer", transition: "all 0.2s" }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{action.icon}</div>
                        <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{action.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className="msg" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "system" ? (
                    <div style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 10, padding: "8px 12px", color: "#94a3b8", fontSize: 12, maxWidth: "90%" }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ background: msg.role === "user" ? "linear-gradient(135deg,#06b6d4,#3b82f6)" : "rgba(13,24,41,0.8)", color: "#fff", padding: "12px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </div>
                      {msg.role === "assistant" && (
                        <button onClick={() => speakText(msg.content)} style={{ alignSelf: "flex-start", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.25)", color: "#06b6d4", padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                          {speaking ? "⏸ Stop" : "🔊 Speak"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {loading && <div className="msg"><TypingDots /></div>}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: "1px solid rgba(6,182,212,0.12)", padding: 14, background: "rgba(6,10,20,0.6)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <button onClick={startVoice} disabled={!docReady} style={{ background: listening ? "rgba(239,68,68,0.2)" : "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)", color: listening ? "#ef4444" : "#06b6d4", padding: "10px", borderRadius: 10, fontSize: 18, cursor: docReady ? "pointer" : "not-allowed", opacity: docReady ? 1 : 0.5 }}>
                  {listening ? "⏹" : "🎤"}
                </button>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={docReady ? T.askPlaceholder : T.uploadFirst} disabled={!docReady} style={{ flex: 1, background: "rgba(13,24,41,0.6)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, resize: "none", height: 44, fontFamily: "inherit", opacity: docReady ? 1 : 0.5 }} />
                <button onClick={() => sendMessage()} disabled={!input.trim() || loading || !docReady} className="send-btn" style={{ background: input.trim() && docReady ? "linear-gradient(135deg,#06b6d4,#3b82f6)" : "rgba(100,116,139,0.2)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 10, fontSize: 18, cursor: input.trim() && docReady ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
                  ➤
                </button>
              </div>
              <div style={{ marginTop: 8, textAlign: "center", color: "#475569", fontSize: 10 }}>{T.poweredBy}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
