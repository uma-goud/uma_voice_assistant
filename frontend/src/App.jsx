import { useEffect, useRef, useState } from "react";

// true  = sample replies, no backend needed (for building the frontend)
// false = calls the real /api/chat backend
const DEMO_MODE = false;

const QUESTIONS = [
  "What should we know about your life story?",
  "What's your #1 superpower?",
  "What are the top 3 areas you'd like to grow in?",
  "What misconception do your coworkers have about you?",
  "How do you push your boundaries and limits?",
];

const MicIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export default function App() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [text, setText] = useState("");
  const [supported, setSupported] = useState(true);

  const recRef = useRef(null);
  const historyRef = useRef([]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      setStatus("Voice input needs Chrome or Edge. You can type instead.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onend = () => {
      setListening(false);
      setStatus((s) => (s === "Listening..." ? "" : s));
    };
    rec.onerror = () => {
      setListening(false);
      setStatus("Couldn't hear that. Please try again.");
    };
    recRef.current = rec;
  }, []);

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setStatus("");
  }

  async function ask(question) {
    window.speechSynthesis.cancel();
    setSpeaking(false);

    historyRef.current = [...historyRef.current, { role: "user", text: question }];
    setMessages((m) => [...m, { role: "user", text: question }]);
    setThinking(true);
    setStatus("");

    let reply = "Sorry, something went wrong. Please try again.";
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 1200));
      reply = "This is a sample answer, so you can check how the reply looks and sounds.";
    } else {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyRef.current }),
        });
        const data = await res.json();
        reply = data.text || reply;
      } catch (e) {}
    }

    historyRef.current = [...historyRef.current, { role: "assistant", text: reply }];
    setThinking(false);
    setMessages((m) => [...m, { role: "assistant", text: reply }]);

    const utter = new SpeechSynthesisUtterance(reply);
    utter.onstart = () => { setSpeaking(true); setStatus("Speaking..."); };
    utter.onend = () => { setSpeaking(false); setStatus(""); };
    utter.onerror = () => { setSpeaking(false); setStatus(""); };
    window.speechSynthesis.speak(utter);
  }

  function toggleMic() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    if (!recRef.current) return;
    if (listening) {
      recRef.current.stop();
    } else {
      setListening(true);
      setStatus("Listening...");
      recRef.current.start();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (text.trim()) {
      ask(text.trim());
      setText("");
    }
  }

  const empty = messages.length === 0 && !thinking;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="avatar">U</span>
          <div className="brand-text">
            <span className="brand-name">Uma Baleboyina</span>
            <span className="brand-role">B.Tech CSE '26 · Aspiring AI Engineer</span>
          </div>
        </div>
        <span className="live">
          <i className="dot" />
          AI voice bot
        </span>
      </header>

      <main className="scroll">
        <div className="column">
          {empty && (
            <div className="hero">
              <h1>Hi, I'm Uma</h1>
              <p>Ask me anything about my background, projects or goals. Talk to me with your voice, or type below.</p>

              <button
                className={"talk" + (listening ? " on" : "")}
                onClick={toggleMic}
                disabled={!supported}
              >
                {listening ? <StopIcon /> : <MicIcon size={22} />}
                <span>{listening ? "Listening... tap to stop" : "Tap to talk"}</span>
              </button>

              <div className="try">Or try asking</div>
              <div className="cards">
                {QUESTIONS.map((q) => (
                  <button key={q} onClick={() => ask(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="turn user">
                <div className="ububble">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="turn bot">
                <span className="avatar">U</span>
                <div className="btext">{m.text}</div>
              </div>
            )
          )}

          {thinking && (
            <div className="turn bot">
              <span className="avatar">U</span>
              <div className="btext"><span className="dots"><i /><i /><i /></span></div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="dock">
        <div className="column">
          <div className="statusline" aria-live="polite">
            {status}
            {speaking && (
              <button className="stop" onClick={stopSpeaking}>
                <StopIcon /> Stop speaking
              </button>
            )}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={listening ? "Listening..." : "Ask me anything..."}
              aria-label="Type your question"
            />
            <button
              type="button"
              className={"icon mic" + (listening ? " on" : "")}
              onClick={toggleMic}
              disabled={!supported}
              aria-label={listening ? "Stop listening" : "Start talking"}
            >
              {listening ? <StopIcon /> : <MicIcon />}
            </button>
            <button type="submit" className="icon send" aria-label="Send" disabled={!text.trim()}>
              <SendIcon />
            </button>
          </form>
          <p className="note">Works best in Chrome or Edge with the microphone allowed.</p>
        </div>
      </footer>
    </div>
  );
}