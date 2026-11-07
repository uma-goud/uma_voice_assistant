import { useEffect, useRef, useState } from "react";

// true = sample replies, false = calls the real backend
const DEMO_MODE = false;

// true = use offline voices (instant, never regenerates, slightly less natural)
// false = allow online voices (more natural, but they stream over the internet)
const PREFER_LOCAL = false;

const QUESTIONS = [
  "What should we know about your life story?",
  "What's your #1 superpower?",
  "What are the top 3 areas you'd like to grow in?",
  "What misconception do your coworkers have about you?",
  "How do you push your boundaries and limits?",
];

// Voice name patterns
const MALE_RE =
  /\b(male|ravi|prabhat|david|mark|guy|ryan|george|james|daniel|brian|christopher|eric|alex|fred|thomas|oliver|rishi)\b/i;
const FEMALE_RE =
  /(female|neerja|heera|veena|aria|jenny|zira|samantha|susan|hazel|libby|sonia|natasha|karen|moira|tessa|fiona|victoria|google us english)/i;

const isMale = (v) => MALE_RE.test(v.name);
const isFemale = (v) => FEMALE_RE.test(v.name) && !isMale(v);

// First chunk is short so speech starts fast; later chunks are larger.
function chunkText(text, firstMax = 110, max = 200) {
  const sentences =
    text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
  const chunks = [];
  let current = "";

  for (const s of sentences) {
    const limit = chunks.length === 0 ? firstMax : max;
    if (current && (current + " " + s).length > limit) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? current + " " + s : s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const MicIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

const SendIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
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
  const voiceRef = useRef(null);
  const femaleVoiceRef = useRef(false);

  // Keep the chat scrolled to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  // Choose a female English voice (Indian English first).
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;

    function loadVoices() {
      const all = synth.getVoices();
      if (!all.length) return;

      const local = all.filter((v) => v.localService);
      const voices = PREFER_LOCAL && local.length ? local : all;

      const english = voices.filter((v) =>
        v.lang.toLowerCase().startsWith("en")
      );
      const indian = english.filter(
        (v) => v.lang.toLowerCase().replace("_", "-") === "en-in"
      );
      const quality = /natural|neural|online|google/i;

      const selected =
        indian.find((v) => isFemale(v) && quality.test(v.name)) ||
        indian.find(isFemale) ||
        english.find((v) => isFemale(v) && quality.test(v.name)) ||
        english.find(isFemale) ||
        indian.find((v) => !isMale(v)) ||
        english.find((v) => !isMale(v)) ||
        null;

      voiceRef.current = selected;
      femaleVoiceRef.current = !!selected && isFemale(selected);

      if (selected) {
        console.log(
          "Selected speech voice:",
          selected.name,
          selected.lang,
          selected.localService ? "(offline)" : "(online)",
          femaleVoiceRef.current ? "(female)" : "(unknown gender)"
        );
      } else {
        console.log("No suitable voice found. Using browser default.");
      }
    }

    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => synth.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // Configure speech recognition.
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

    rec.onresult = (e) => {
      ask(e.results[0][0].transcript);
    };

    rec.onend = () => {
      setListening(false);
      setStatus((s) => (s === "Listening..." ? "" : s));
    };

    rec.onerror = () => {
      setListening(false);
      setStatus("Couldn't hear that. Please try again.");
    };

    recRef.current = rec;

    return () => {
      rec.abort();
    };
  }, []);

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setStatus("");
  }

  // Speak in small chunks: a short first chunk so speech starts quickly,
  // then larger chunks so the gaps between them stay small.
  function speak(reply) {
    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setStatus(
        "Your browser can't play voice. You can read the reply above."
      );
      return;
    }

    const synth = window.speechSynthesis;
    const voice = voiceRef.current;
    const parts = chunkText(reply);

    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);

      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-IN";

      u.rate = 0.98;
      // If no confirmed female voice exists, raise the pitch a little.
      u.pitch = femaleVoiceRef.current ? 1.02 : 1.2;
      u.volume = 1;

      if (i === 0) {
        u.onstart = () => {
          setSpeaking(true);
          setStatus("Speaking...");
        };
      }

      if (i === parts.length - 1) {
        u.onend = () => {
          setSpeaking(false);
          setStatus("");
        };
      }

      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        console.error("Speech playback error:", e.error);
        setSpeaking(false);
        setStatus("");
      };

      synth.speak(u);
    });
  }

  async function ask(question) {
    if (!question?.trim()) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);

    historyRef.current = [
      ...historyRef.current,
      { role: "user", text: question },
    ];
    setMessages((m) => [...m, { role: "user", text: question }]);
    setThinking(true);
    setStatus("");

    let reply = "Sorry, something went wrong. Please try again.";

    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 1200));
      reply =
        "This is a sample answer, so you can check how the reply looks and sounds.";
    } else {
      try {
        const requestStart = performance.now();

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyRef.current }),
        });

        const data = await res.json();

        console.log(
          "API response time:",
          Math.round(performance.now() - requestStart),
          "ms"
        );

        if (!res.ok) {
          throw new Error(data.text || "Unable to generate a response.");
        }

        reply = data.text || reply;
      } catch (error) {
        console.error("Chat request failed:", error);
        reply = "I'm having trouble responding right now. Please try again.";
      }
    }

    historyRef.current = [
      ...historyRef.current,
      { role: "assistant", text: reply },
    ];

    setThinking(false);
    setMessages((m) => [...m, { role: "assistant", text: reply }]);

    speak(reply);
  }

  function toggleMic() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);

    if (!recRef.current) return;

    if (listening) {
      recRef.current.stop();
    } else {
      setListening(true);
      setStatus("Listening...");

      try {
        recRef.current.start();
      } catch (error) {
        console.error("Microphone error:", error);
        setListening(false);
        setStatus("Unable to start microphone. Please try again.");
      }
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
            <span className="brand-role">
              B.Tech CSE '26 · Aspiring AI Engineer
            </span>
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

              <p>
                Ask me anything about my background, projects or goals. Talk to
                me with your voice, or type below.
              </p>

              <button
                className={"talk" + (listening ? " on" : "")}
                onClick={toggleMic}
                disabled={!supported}
              >
                {listening ? <StopIcon /> : <MicIcon size={22} />}

                <span>
                  {listening ? "Listening... tap to stop" : "Tap to talk"}
                </span>
              </button>

              <div className="try">Or try asking</div>

              <div className="cards">
                {QUESTIONS.map((q) => (
                  <button key={q} onClick={() => ask(q)}>
                    {q}
                  </button>
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

              <div className="btext">
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
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
                <StopIcon />
                Stop speaking
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

            <button
              type="submit"
              className="icon send"
              aria-label="Send"
              disabled={!text.trim()}
            >
              <SendIcon />
            </button>
          </form>

          <p className="note">
            Works best in Chrome or Edge with the microphone allowed.
          </p>
        </div>
      </footer>
    </div>
  );
}