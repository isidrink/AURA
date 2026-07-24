"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import Avatar3D from "./Avatar3D";

type CallState = "idle" | "connecting" | "active" | "speaking" | "error";
type Locale = "ES" | "CA" | "EN";
type Viseme =
  | "sil" | "PP" | "FF" | "TH" | "DD" | "kk" | "CH" | "SS"
  | "nn" | "RR" | "aa" | "E" | "I" | "O" | "U";
type LipSyncFeatures = {
  rms: number;
  zcr: number;
  low: number;
  mid: number;
  high: number;
  viseme: Viseme;
};

const AUDIO_SAMPLE_RATE = 24000;

class RealtimeVisemeDetector {
  private history: number[][] = [];
  private current: Viseme = "sil";
  private changedAt = 0;

  process(analyser: AnalyserNode, speaking: boolean) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const binWidth = analyser.context.sampleRate / analyser.fftSize;
    const ranges = [
      [50, 200], [200, 400], [400, 800], [800, 1500],
      [1500, 2500], [2500, 4000], [4000, 8000],
    ];
    const bands = ranges.map(([start, end]) => {
      const first = Math.max(0, Math.round(start / binWidth));
      const last = Math.min(data.length - 1, Math.round(end / binWidth));
      let sum = 0;
      for (let index = first; index <= last; index += 1) sum += data[index];
      return sum / Math.max(1, last - first + 1) / 255;
    });
    this.history.push(bands);
    if (this.history.length > 4) this.history.shift();

    const average = bands.map((_, band) =>
      this.history.reduce((sum, item) => sum + item[band], 0) /
      Math.max(1, this.history.length),
    );
    const volume = bands.reduce((sum, value) => sum + value, 0) / bands.length;
    let weighted = 0;
    let energy = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index] / 255;
      weighted += index * binWidth * value;
      energy += value;
    }
    const centroid = energy > 0 ? weighted / energy : 0;
    const [sub, f1Low, f1, f2, f3, fricative, sibilant] = average;
    let next: Viseme = "sil";

    if (speaking && volume > 0.035) {
      if (sibilant > 0.22 && centroid > 4200) next = centroid > 6100 ? "SS" : "CH";
      else if (fricative > 0.2 && centroid > 2600) next = centroid > 3900 ? "FF" : "TH";
      else if (volume < 0.1 && f3 > f1) next = centroid > 2400 ? "kk" : "PP";
      else if (f1 > f1Low * 1.12 && f1 > f2) next = f3 > 0.18 ? "O" : "I";
      else if (f1Low > f1 * 1.08 && f2 < f1Low) next = sub > 0.12 ? "U" : "E";
      else if (f2 > f1 && f2 > f3 * 1.05) next = "aa";
      else if (centroid > 2300) next = "RR";
      else next = volume > 0.16 ? "aa" : "nn";
    }

    const now = performance.now();
    const minimumHold = this.current === "sil" ? 16 : 38;
    if (next !== this.current && now - this.changedAt >= minimumHold) {
      this.current = next;
      this.changedAt = now;
    }
    return this.current;
  }

  reset() {
    this.history = [];
    this.current = "sil";
    this.changedAt = 0;
  }
}

const copy = {
  ES: {
    languageName: "Español",
    navLabel: "Seleccionar idioma",
    eyebrow: "RECEPCIÓN INTELIGENTE · DISPONIBLE 24/7",
    hello: "Hola, soy",
    question: "¿En qué puedo ayudarte?",
    intro: "Puedo ayudarte con reservas, horarios y recomendaciones. Habla conmigo de forma natural.",
    talk: "Hablar con Aura",
    connecting: "Conectando…",
    end: "Finalizar conversación",
    ready: "Micrófono listo",
    listening: "Aura te está escuchando",
    speaking: "Aura está respondiendo",
    finished: "Conversación finalizada",
    connectionError: "No se pudo mantener la conexión",
    microphoneError: "No se pudo acceder al micrófono",
    setupMissing: "Demo visual: falta conectar el agente RetellAI",
    topic: "Tema seleccionado",
    quickLabel: "Consultas rápidas",
    avatarLabel: "Avatar virtual Aura",
    avatarAlt: "Aura, recepcionista virtual",
    online: "ONLINE",
    live: "EN CONVERSACIÓN",
    sectors: ["Restaurantes", "Hoteles", "Turismo"],
    tagline: "Experiencia humana. Tecnología inteligente.",
    suggestions: [
      { icon: "⌑", label: "Reservar una mesa", prompt: "Quiero reservar una mesa" },
      { icon: "◷", label: "Consultar horarios", prompt: "¿Cuál es el horario?" },
      { icon: "✦", label: "Recomendaciones", prompt: "¿Qué me recomiendas?" },
    ],
  },
  CA: {
    languageName: "Català",
    navLabel: "Selecciona l’idioma",
    eyebrow: "RECEPCIÓ INTEL·LIGENT · DISPONIBLE 24/7",
    hello: "Hola, soc",
    question: "Com et puc ajudar?",
    intro: "Puc ajudar-te amb reserves, horaris i recomanacions. Parla amb mi amb tota naturalitat.",
    talk: "Parlar amb l’Aura",
    connecting: "Connectant…",
    end: "Finalitzar la conversa",
    ready: "Micròfon preparat",
    listening: "L’Aura t’està escoltant",
    speaking: "L’Aura està responent",
    finished: "Conversa finalitzada",
    connectionError: "No s’ha pogut mantenir la connexió",
    microphoneError: "No s’ha pogut accedir al micròfon",
    setupMissing: "Demostració visual: falta connectar l’agent de RetellAI",
    topic: "Tema seleccionat",
    quickLabel: "Consultes ràpides",
    avatarLabel: "Avatar virtual Aura",
    avatarAlt: "Aura, recepcionista virtual",
    online: "EN LÍNIA",
    live: "EN CONVERSA",
    sectors: ["Restaurants", "Hotels", "Turisme"],
    tagline: "Experiència humana. Tecnologia intel·ligent.",
    suggestions: [
      { icon: "⌑", label: "Reservar una taula", prompt: "Vull reservar una taula" },
      { icon: "◷", label: "Consultar horaris", prompt: "Quin és l’horari?" },
      { icon: "✦", label: "Recomanacions", prompt: "Què em recomanes?" },
    ],
  },
  EN: {
    languageName: "English",
    navLabel: "Select language",
    eyebrow: "SMART RECEPTION · AVAILABLE 24/7",
    hello: "Hello, I’m",
    question: "How can I help you?",
    intro: "I can help with reservations, opening hours and recommendations. Just speak to me naturally.",
    talk: "Talk to Aura",
    connecting: "Connecting…",
    end: "End conversation",
    ready: "Microphone ready",
    listening: "Aura is listening",
    speaking: "Aura is responding",
    finished: "Conversation ended",
    connectionError: "The connection could not be maintained",
    microphoneError: "Microphone access was not available",
    setupMissing: "Visual demo: connect the RetellAI agent to begin",
    topic: "Selected topic",
    quickLabel: "Quick questions",
    avatarLabel: "Aura virtual avatar",
    avatarAlt: "Aura, virtual receptionist",
    online: "ONLINE",
    live: "IN CONVERSATION",
    sectors: ["Restaurants", "Hotels", "Tourism"],
    tagline: "Human experience. Intelligent technology.",
    suggestions: [
      { icon: "⌑", label: "Book a table", prompt: "I would like to book a table" },
      { icon: "◷", label: "Check opening hours", prompt: "What are your opening hours?" },
      { icon: "✦", label: "Recommendations", prompt: "What do you recommend?" },
    ],
  },
} as const;

export default function Home() {
  const clientRef = useRef<RetellWebClient | null>(null);
  const audioLevelRef = useRef(0);
  const audioFeaturesRef = useRef<LipSyncFeatures>({
    rms: 0,
    zcr: 0,
    low: 0,
    mid: 0,
    high: 0,
    viseme: "sil",
  });
  const visemeDetectorRef = useRef(new RealtimeVisemeDetector());
  const analyserConfiguredRef = useRef(false);
  const speakingRef = useRef(false);
  const [locale, setLocale] = useState<Locale>("ES");
  const [callState, setCallState] = useState<CallState>("idle");
  const [noticeKey, setNoticeKey] = useState<"ready" | "connecting" | "listening" | "speaking" | "finished" | "connectionError" | "microphoneError" | "setupMissing">("ready");
  const [topicNotice, setTopicNotice] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const active = callState === "active" || callState === "speaking";
  const text = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale.toLowerCase();
    return () => {
      clientRef.current?.stopCall();
    };
  }, [locale]);

  const stopCall = useCallback(() => {
    clientRef.current?.stopCall();
    clientRef.current = null;
    audioLevelRef.current = 0;
    audioFeaturesRef.current = { rms: 0, zcr: 0, low: 0, mid: 0, high: 0, viseme: "sil" };
    visemeDetectorRef.current.reset();
    analyserConfiguredRef.current = false;
    speakingRef.current = false;
    setCallState("idle");
    setTopicNotice("");
    setNoticeKey("finished");
  }, []);

  const startCall = useCallback(async () => {
    if (active) {
      stopCall();
      return;
    }

    setCallState("connecting");
    setTopicNotice("");
    setNoticeKey("connecting");

    try {
      const response = await fetch("/api/retell-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: locale.toLowerCase(), context: selectedPrompt }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo iniciar la llamada");

      const client = new RetellWebClient();
      clientRef.current = client;

      client.on("call_started", () => {
        setCallState("active");
        setNoticeKey("listening");
      });
      client.on("agent_start_talking", () => {
        speakingRef.current = true;
        setCallState("speaking");
        setNoticeKey("speaking");
      });
      client.on("agent_stop_talking", () => {
        speakingRef.current = false;
        audioLevelRef.current = 0;
        setCallState("active");
        setNoticeKey("listening");
      });
      client.on("audio", (audio: Float32Array) => {
        let energy = 0;
        let zeroCrossings = 0;
        for (let index = 0; index < audio.length; index += 1) {
          energy += audio[index] * audio[index];
          if (
            index > 0 &&
            ((audio[index] >= 0 && audio[index - 1] < 0) ||
              (audio[index] < 0 && audio[index - 1] >= 0))
          ) {
            zeroCrossings += 1;
          }
        }
        const rms = Math.sqrt(energy / Math.max(1, audio.length));
        const analyser = client.analyzerComponent?.analyser;
        if (analyser && !analyserConfiguredRef.current) {
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.18;
          analyser.minDecibels = -68;
          analyser.maxDecibels = -16;
          analyserConfiguredRef.current = true;
        }
        const viseme = analyser
          ? visemeDetectorRef.current.process(analyser, speakingRef.current)
          : "sil";

        audioLevelRef.current = rms;
        audioFeaturesRef.current = {
          rms,
          zcr: Math.min(1, (zeroCrossings / Math.max(1, audio.length)) * 10),
          low: 0,
          mid: 0,
          high: 0,
          viseme,
        };
      });
      client.on("call_ended", () => {
        clientRef.current = null;
        audioLevelRef.current = 0;
        audioFeaturesRef.current = { rms: 0, zcr: 0, low: 0, mid: 0, high: 0, viseme: "sil" };
        visemeDetectorRef.current.reset();
        analyserConfiguredRef.current = false;
        speakingRef.current = false;
        setCallState("idle");
        setNoticeKey("ready");
      });
      client.on("error", () => {
        client.stopCall();
        clientRef.current = null;
        audioLevelRef.current = 0;
        audioFeaturesRef.current = { rms: 0, zcr: 0, low: 0, mid: 0, high: 0, viseme: "sil" };
        visemeDetectorRef.current.reset();
        analyserConfiguredRef.current = false;
        speakingRef.current = false;
        setCallState("error");
        setNoticeKey("connectionError");
      });

      await client.startCall({
        accessToken: payload.access_token,
        sampleRate: AUDIO_SAMPLE_RATE,
        emitRawAudioSamples: true,
      });
    } catch (error) {
      setCallState("error");
      setNoticeKey(error instanceof Error && error.message.includes("configurar") ? "setupMissing" : "microphoneError");
    }
  }, [active, locale, selectedPrompt, stopCall]);

  return (
    <main className={`experience ${active ? "is-live" : ""}`}>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Aura, inicio">
          AURA<span className="brand-dot">.</span>
        </a>
        <nav className="locale" aria-label={text.navLabel}>
          {(["ES", "CA", "EN"] as Locale[]).map((language) => (
            <button
              aria-label={copy[language].languageName}
              className={locale === language ? "selected" : ""}
              key={language}
              onClick={() => {
                setLocale(language);
                setSelectedPrompt("");
                setTopicNotice("");
                setNoticeKey("ready");
              }}
              type="button"
            >
              {language}
            </button>
          ))}
        </nav>
      </header>

      <section className="hero">
        <div className="copy">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>
            {text.hello} <em>Aura.</em>
            <br />
            {text.question}
          </h1>
          <p className="intro">{text.intro}</p>

          <button
            className="voice-button"
            disabled={callState === "connecting"}
            onClick={startCall}
            type="button"
          >
            <span className="mic" aria-hidden="true">◉</span>
            {callState === "connecting"
              ? text.connecting
              : active
                ? text.end
                : text.talk}
          </button>

          <div className={`status ${callState}`} role="status" aria-live="polite">
            <span />
            {topicNotice || text[noticeKey]}
          </div>

          <div className="suggestions" aria-label={text.quickLabel}>
            {text.suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                onClick={() => {
                  setSelectedPrompt(suggestion.prompt);
                  setTopicNotice(`${text.topic}: ${suggestion.label}`);
                }}
                type="button"
              >
                <span aria-hidden="true">{suggestion.icon}</span>
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>

        <div className="avatar-stage" aria-label={text.avatarLabel}>
          <div className="halo" />
          <div className="avatar-card">
            <Avatar3D
              audioLevelRef={audioLevelRef}
              audioFeaturesRef={audioFeaturesRef}
              speakingRef={speakingRef}
            />
            <div className="live-badge">
              <span />
              {active ? text.live : text.online}
            </div>
            <div className="soundwave" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7].map((bar) => <i key={bar} />)}
            </div>
          </div>
        </div>
      </section>

      <footer className="footer-note">
        <span>{text.sectors[0]}</span><i />
        <span>{text.sectors[1]}</span><i />
        <span>{text.sectors[2]}</span>
        <b>{text.tagline}</b>
      </footer>
    </main>
  );
}
