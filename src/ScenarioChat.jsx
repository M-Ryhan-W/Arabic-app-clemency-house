import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { MdArrowBackIosNew } from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
import { Leapfrog } from 'ldrs/react';
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import 'ldrs/react/Leapfrog.css';

const MAX_AUDIO_BASE64_LENGTH = 5 * 1024 * 1024;

const scenarioContext = {
  cafe: "You are visiting an Arabic café. Order your favorite drink and a snack from the waiter.",
  restaurant: "You are dining at an Arabic restaurant. Browse the menu and order food from the waiter.",
  groceries: "You are at a local grocery store. Pick up fruits, vegetables, and household items from the shopkeeper.",
  hotel: "You are checking into a hotel. Talk to the receptionist about your reservation and get your room key.",
  airport: "You are at the airport check-in counter. Present your passport and check in for your flight.",
  directions: "You are lost in a new city. Ask a local on the street for directions to the mosque, library, or market.",
  market: "You are exploring a traditional market. Negotiate the price of spices and goods with the vendor.",
  clothes: "You are at a clothing store. Ask the assistant to help you find the right sizes and colors.",
  bookstore: "You are visiting a bookstore. Ask the clerk to help you find an Arabic book suited to your level.",
  meeting: "You are at a social gathering. Introduce yourself to a friendly new person and have a casual chat.",
  invitation: "You are talking to a friend. Invite them to a dinner or a party, and discuss the details.",
  family: "You are at a family gathering. Chat with your relative about life, work, and family news.",
  pharmacy: "You are feeling unwell. Explain your symptoms to the pharmacist and ask for recommendations.",
  taxi: "You are taking a taxi. Tell the driver where you want to go, and ask about the route and fare.",
  bank: "You are at the bank. Speak to the teller to open an account or exchange money.",
  school: "It's your first day at school. Meet your teacher, introduce yourself, and talk about your favorite subjects.",
  gym: "You are at a fitness club. Talk to the gym trainer about signing up and your fitness goals.",
  doctor: "You have a doctor's appointment. Explain your symptoms to the doctor to get advice and treatment.",
  library: "You are at the public library. Ask the librarian about borrowing books or finding a quiet study spot.",
  bakery: "You are at a local bakery. Buy fresh bread, pastries, and sweets from the baker.",
  phone: "You are at a phone store. Talk to the employee about buying a new phone or repairing your broken one.",
  park: "You are relaxing on a bench at the park. Have a friendly chat with someone sitting next to you.",
  post_office: "You are at the post office. Speak to the clerk to send a package or buy stamps.",
  barber: "You are at the barber shop. Explain to the barber how you want your hair cut.",
  neighbor: "You just moved in. Meet your new neighbor, introduce yourself, and chat about the area.",
  travel_agent: "You are at a travel agency. Talk to the agent about planning a trip and suggest activities.",
  mechanic: "Your car has a problem. Explain the issue to the mechanic and ask what needs to be fixed.",
  birthday: "You're at a friend's birthday party. Chat with other guests and celebrate.",
  rent: "You are looking to rent an apartment. Talk to the landlord, ask for a tour, and discuss the price.",
  wedding: "You are a guest at a wedding. Celebrate and chat with the other guests about the ceremony.",
};

const scenarioVocab = {
  "cafe": [{ ar: "قهوة", en: "Coffee" }, { ar: "شاي", en: "Tea" }, { ar: "حليب", en: "Milk" }, { ar: "حساب", en: "Bill" }, { ar: "سكر", en: "Sugar" }, { ar: "كعكة", en: "Cake" }],
  "restaurant": [{ ar: "طاولة", en: "Table" }, { ar: "قائمة", en: "Menu" }, { ar: "لذيذ", en: "Delicious" }, { ar: "دجاج", en: "Chicken" }, { ar: "ماء", en: "Water" }, { ar: "لحم", en: "Meat" }],
  "groceries": [{ ar: "فواكه", en: "Fruits" }, { ar: "خضار", en: "Vegetables" }, { ar: "كم السعر", en: "How much?" }, { ar: "خبز", en: "Bread" }, { ar: "طماطم", en: "Tomato" }, { ar: "بيض", en: "Eggs" }],
  "hotel": [{ ar: "غرفة", en: "Room" }, { ar: "حجز", en: "Reservation" }, { ar: "ليلة", en: "Night" }, { ar: "مفتاح", en: "Key" }, { ar: "جواز سفر", en: "Passport" }, { ar: "سرير", en: "Bed" }],
  "airport": [{ ar: "جواز سفر", en: "Passport" }, { ar: "تذكرة", en: "Ticket" }, { ar: "حقيبة", en: "Bag" }, { ar: "رحلة", en: "Flight" }, { ar: "طائرة", en: "Airplane" }, { ar: "بوابة", en: "Gate" }],
  "directions": [{ ar: "أين", en: "Where" }, { ar: "يمين", en: "Right" }, { ar: "يسار", en: "Left" }, { ar: "طريق", en: "Road" }, { ar: "مسجد", en: "Mosque" }, { ar: "قريب", en: "Near" }],
  "market": [{ ar: "سعر", en: "Price" }, { ar: "غالي", en: "Expensive" }, { ar: "رخيص", en: "Cheap" }, { ar: "أريد", en: "I want" }, { ar: "ممكن", en: "Is it possible" }, { ar: "تفضل", en: "Here you go" }],
  "clothes": [{ ar: "قميص", en: "Shirt" }, { ar: "سروال", en: "Pants" }, { ar: "مقاس", en: "Size" }, { ar: "لون", en: "Color" }, { ar: "حذاء", en: "Shoes" }, { ar: "أكبر", en: "Larger" }],
  "bookstore": [{ ar: "كتاب", en: "Book" }, { ar: "قصة", en: "Story" }, { ar: "قراءة", en: "Reading" }, { ar: "قاموس", en: "Dictionary" }, { ar: "عربي", en: "Arabic" }, { ar: "لغة", en: "Language" }],
  "meeting": [{ ar: "اسمي", en: "My name" }, { ar: "تشرفنا", en: "Nice to meet you" }, { ar: "طالب", en: "Student" }, { ar: "من أين", en: "From where" }, { ar: "عمل", en: "Work" }, { ar: "جامعة", en: "University" }],
  "invitation": [{ ar: "دعوة", en: "Invitation" }, { ar: "متى", en: "When" }, { ar: "وقت", en: "Time" }, { ar: "موعد", en: "Appointment" }, { ar: "غداً", en: "Tomorrow" }, { ar: "عشاء", en: "Dinner" }],
  "family": [{ ar: "عائلة", en: "Family" }, { ar: "أخ", en: "Brother" }, { ar: "أخت", en: "Sister" }, { ar: "كيف حال", en: "How is..." }, { ar: "أب", en: "Father" }, { ar: "أم", en: "Mother" }],
  "pharmacy": [{ ar: "صيدلية", en: "Pharmacy" }, { ar: "دواء", en: "Medicine" }, { ar: "مريض", en: "Sick" }, { ar: "ألم", en: "Pain" }, { ar: "صداع", en: "Headache" }, { ar: "طبيب", en: "Doctor" }],
  "taxi": [{ ar: "سيارة أجرة", en: "Taxi" }, { ar: "إلى أين", en: "Where to" }, { ar: "مطار", en: "Airport" }, { ar: "توقف", en: "Stop" }, { ar: "عنوان", en: "Address" }, { ar: "هنا", en: "Here" }],
  "bank": [{ ar: "بنك", en: "Bank" }, { ar: "نقود", en: "Money" }, { ar: "حساب", en: "Account" }, { ar: "صرف", en: "Exchange" }, { ar: "دولار", en: "Dollar" }, { ar: "بطاقة", en: "Card" }],
  "school": [{ ar: "مدرسة", en: "School" }, { ar: "معلم", en: "Teacher" }, { ar: "صف", en: "Class" }, { ar: "درس", en: "Lesson" }, { ar: "كتاب", en: "Book" }, { ar: "سؤال", en: "Question" }],
  "gym": [{ ar: "نادي", en: "Gym" }, { ar: "رياضة", en: "Sport" }, { ar: "وزن", en: "Weight" }, { ar: "تدريب", en: "Training" }, { ar: "صحة", en: "Health" }, { ar: "اشتراك", en: "Subscription" }],
  "doctor": [{ ar: "طبيب", en: "Doctor" }, { ar: "مستشفى", en: "Hospital" }, { ar: "موعد", en: "Appointment" }, { ar: "علاج", en: "Treatment" }, { ar: "ألم", en: "Pain" }, { ar: "مريض", en: "Sick" }],
  "library": [{ ar: "مكتبة", en: "Library" }, { ar: "استعارة", en: "Borrow" }, { ar: "هدوء", en: "Quiet" }, { ar: "بطاقة", en: "Card" }, { ar: "كتاب", en: "Book" }, { ar: "قراءة", en: "Read" }],
  "bakery": [{ ar: "مخبز", en: "Bakery" }, { ar: "خبز", en: "Bread" }, { ar: "حلوى", en: "Sweets" }, { ar: "طازج", en: "Fresh" }, { ar: "كعكة", en: "Cake" }, { ar: "لذيذ", en: "Delicious" }],
  "phone": [{ ar: "هاتف", en: "Phone" }, { ar: "شاشة", en: "Screen" }, { ar: "تصليح", en: "Repair" }, { ar: "شاحن", en: "Charger" }, { ar: "جديد", en: "New" }, { ar: "مشكلة", en: "Problem" }],
  "park": [{ ar: "حديقة", en: "Park" }, { ar: "طقس", en: "Weather" }, { ar: "جميل", en: "Beautiful" }, { ar: "جلوس", en: "Sitting" }, { ar: "أشجار", en: "Trees" }, { ar: "مشمس", en: "Sunny" }],
  "post_office": [{ ar: "بريد", en: "Post" }, { ar: "رسالة", en: "Letter" }, { ar: "طابع", en: "Stamp" }, { ar: "عنوان", en: "Address" }, { ar: "طرد", en: "Package" }, { ar: "إرسال", en: "Send" }],
  "barber": [{ ar: "حلاق", en: "Barber" }, { ar: "شعر", en: "Hair" }, { ar: "قص", en: "Cut" }, { ar: "قصير", en: "Short" }, { ar: "طويل", en: "Long" }, { ar: "لحية", en: "Beard" }],
  "neighbor": [{ ar: "جار", en: "Neighbor" }, { ar: "بيت", en: "House" }, { ar: "جديد", en: "New" }, { ar: "منطقة", en: "Area" }, { ar: "أهلاً", en: "Welcome" }, { ar: "مساعدة", en: "Help" }],
  "travel_agent": [{ ar: "سفر", en: "Travel" }, { ar: "طائرة", en: "Airplane" }, { ar: "فندق", en: "Hotel" }, { ar: "عطلة", en: "Holiday" }, { ar: "دولار", en: "Dollar" }, { ar: "تذكرة", en: "Ticket" }],
  "mechanic": [{ ar: "ميكانيكي", en: "Mechanic" }, { ar: "سيارة", en: "Car" }, { ar: "مشكلة", en: "Problem" }, { ar: "إصلاح", en: "Fix" }, { ar: "محرك", en: "Engine" }, { ar: "زيت", en: "Oil" }],
  "birthday": [{ ar: "عيد ميلاد", en: "Birthday" }, { ar: "هدية", en: "Gift" }, { ar: "عمر", en: "Age" }, { ar: "مبروك", en: "Congratulations" }, { ar: "سنة", en: "Year" }, { ar: "حفلة", en: "Party" }],
  "rent": [{ ar: "شقة", en: "Apartment" }, { ar: "إيجار", en: "Rent" }, { ar: "شهر", en: "Month" }, { ar: "عقد", en: "Contract" }, { ar: "غرفة", en: "Room" }, { ar: "مفتاح", en: "Key" }],
  "wedding": [{ ar: "زفاف", en: "Wedding" }, { ar: "عروس", en: "Bride" }, { ar: "عريس", en: "Groom" }, { ar: "احتفال", en: "Celebration" }, { ar: "مبروك", en: "Congratulations" }, { ar: "جميل", en: "Beautiful" }],
};

export default function ScenarioChat({
  scenarioData,
  scenarioCompleted,
  user,
  onComplete,
  onExit,
  supabase,
  triggerHaptic,
  triggerHeavyHaptic
}) {
  const [scenarioPhase, setScenarioPhase] = useState("difficulty");
  const [scenarioDifficulty, setScenarioDifficulty] = useState(null);
  const [scenarioMessages, setScenarioMessages] = useState([]);
  const [scenarioRecording, setScenarioRecording] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioKeyPhrases, setScenarioKeyPhrases] = useState([]);
  const [showScenarioHelp, setShowScenarioHelp] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpData, setHelpData] = useState(null);
  const [scenarioTurnCount, setScenarioTurnCount] = useState(0);
  const [scenarioRecordingSeconds, setScenarioRecordingSeconds] = useState(0);
  const [scenarioEnded, setScenarioEnded] = useState(false);
  const [streamingAiText, setStreamingAiText] = useState("");

  const [playingAudioUrl, setPlayingAudioUrl] = useState(null); // Track which audio is playing
  const [scenarioVoice, setScenarioVoice] = useState(null); // Track assigned TTS voice

  const scenarioRecorderRef = useRef(null);
  const scenarioStreamRef = useRef(null);
  const scenarioChunksRef = useRef([]);
  const scenarioChatEndRef = useRef(null);
  const scenarioMessagesRef = useRef([]);
  const scenarioAudioRef = useRef(null);
  const scenarioStartTimeRef = useRef(null);
  const scenarioCountdownRef = useRef(null);
  const scenarioTtsCache = useRef({});


  const speakArabic = (text) => {
    try { window.speechSynthesis.cancel(); } catch (e) { }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA';
      u.rate = 0.8;
      window.speechSynthesis.speak(u);
    } catch (e) { }
  };


  const speakEnglish = (text) => {
    try { window.speechSynthesis.cancel(); } catch (e) { }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) { }
  };

  const speakAiAudio = async (text, onComplete) => {
    if (!text) return;
    try {
      // Toggle play/pause if this audio is already playing
      if (scenarioAudioRef.current && playingAudioUrl === text) {
        if (!scenarioAudioRef.current.paused) {
          scenarioAudioRef.current.pause();
          setPlayingAudioUrl(null);
          return;
        } else {
           scenarioAudioRef.current.play();
           setPlayingAudioUrl(text);
           return;
        }
      }

      const playAudio = (audioBase64) => {
        if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
        const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
        scenarioAudioRef.current = audio;
        setPlayingAudioUrl(text);
        
        audio.onended = () => {
          setPlayingAudioUrl(null);
          if (onComplete) onComplete();
        };
        audio.onpause = () => {
            // Only clear if it was paused intentionally, not ended 
            // (onended fires separately)
            if (scenarioAudioRef.current === audio && audio.currentTime !== audio.duration) {
                setPlayingAudioUrl(null);
            }
        };

        audio.play().catch(e => {
          console.error("Audio playback failed:", e);
          setPlayingAudioUrl(null);
        });
      };

      // Check cache first
      if (scenarioTtsCache.current[text]) {
        playAudio(scenarioTtsCache.current[text]);
        return;
      }

      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: { action: "generate-tts", text, voice: scenarioVoice }
      });
      if (error) throw error;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed.audioBase64) {
        scenarioTtsCache.current[text] = parsed.audioBase64;
        playAudio(parsed.audioBase64);
      } else {
        throw new Error("No audio returned");
      }
    } catch (e) {
      console.error("High-quality TTS failed:", e);
    }
  };

  async function startScenarioChat(difficulty) {
    // Generate a random voice for this session
    const voicePool = [
        "ar-XA-Chirp3-HD-Puck", "ar-XA-Chirp3-HD-Aoede",
        "ar-XA-Chirp3-HD-Charon", "ar-XA-Chirp3-HD-Kore",
        "ar-XA-Chirp3-HD-Fenrir", "ar-XA-Chirp3-HD-Leda",
    ];
    const newVoice = voicePool[Math.floor(Math.random() * voicePool.length)];
    setScenarioVoice(newVoice);

    setScenarioDifficulty(difficulty);
    setScenarioPhase("briefing");
    setScenarioMessages([]);
    setScenarioKeyPhrases([]);
    setScenarioLoading(true);
    setScenarioTurnCount(0);
    setScenarioEnded(false);
    scenarioStartTimeRef.current = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: { action: "start", difficulty, turnCount: 0 }
      });
      console.log('Scenario start raw:', { data, error });
      if (!error && data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        console.log('Scenario start parsed:', parsed);
        if (parsed.message) {
          const aiMsg = {
            role: "ai",
            text: parsed.message,
            translation: parsed.translation || '',
            hint: parsed.hint || '',
            keyPhrase: parsed.keyPhrase || null,
            isTranslationVisible: false,
          };
          setScenarioMessages([aiMsg]);
          scenarioMessagesRef.current = [aiMsg];
          if (parsed.keyPhrase) {
            setScenarioKeyPhrases(prev => [...prev, parsed.keyPhrase]);
          }
          // Audio playback is now delayed until the user clicks "Ready" on the briefing page

        } else {
          // AI returned empty message
          const fallbackMsg = { role: 'ai', text: 'مرحباً! أهلاً وسهلاً', translation: 'Hello! Welcome!', hint: 'Try greeting back with مرحباً or السلام عليكم', keyPhrase: { arabic: 'أهلاً وسهلاً', english: 'Welcome' }, isTranslationVisible: false };
          setScenarioMessages([fallbackMsg]);
          scenarioMessagesRef.current = [fallbackMsg];
        }
      } else {
        console.error('Scenario start error:', error);
        const fallbackMsg = { role: 'ai', text: 'مرحباً! كيف حالك؟', translation: 'Hello! How are you?', hint: 'Try saying مرحباً (Hello) or بخير (Fine)', keyPhrase: { arabic: 'كيف حالك', english: 'How are you?' }, isTranslationVisible: false };
        setScenarioMessages([fallbackMsg]);
        scenarioMessagesRef.current = [fallbackMsg];
      }
    } catch (e) {
      console.error("Error starting scenario:", e);
    }
    setScenarioLoading(false);
  }

  async function startScenarioRecording() {
    try {
      // Request microphone permission explicitly first
      try {
        const permResult = await navigator.permissions.query({ name: 'microphone' });
        if (permResult.state === 'denied') {
          console.error("Microphone permission denied.");
          setScenarioRecording(false);
          return;
        }
      } catch (permErr) {
        console.log('Permissions API not supported, will request via getUserMedia');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      scenarioChunksRef.current = [];
      scenarioStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      scenarioRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          scenarioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(t => t.stop());
        scenarioStreamRef.current = null;

        const recordedMime = recorder.mimeType || 'audio/webm;codecs=opus';
        const blob = new Blob(scenarioChunksRef.current, { type: recordedMime });

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64String = reader.result;
          const base64Audio = base64String.split(',')[1];
          await sendScenarioAudio(base64Audio, recordedMime);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setScenarioRecording(true);
      triggerHaptic();

      if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
      window.speechSynthesis?.cancel();

      setScenarioRecordingSeconds(0);
      scenarioCountdownRef.current = setInterval(() => {
        setScenarioRecordingSeconds(prev => {
          if (prev >= 44) {
            clearInterval(scenarioCountdownRef.current);
            if (scenarioRecorderRef.current?.state === 'recording') {
              scenarioRecorderRef.current.stop();
            }
            setScenarioRecording(false);
            return 45;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      console.error("Scenario recording error:", e);
      setScenarioRecording(false);
    }
  }

  function stopScenarioRecording() {
    clearInterval(scenarioCountdownRef.current);
    if (scenarioRecorderRef.current?.state === 'recording') {
      scenarioRecorderRef.current.stop();
    }
    setScenarioRecording(false);
    triggerHaptic();
  }

  async function requestHelp() {
    const lastAi = [...scenarioMessagesRef.current].reverse().find(m => m.role === 'ai');
    if (!lastAi || helpLoading) return;
    triggerHaptic();
    setHelpLoading(true);
    setHelpData(null);
    try {
      const history = scenarioMessagesRef.current.map(m => ({
        role: m.role,
        text: m.text,
      }));
      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: {
          action: "help",
          lastAiMessage: lastAi.text,
          difficulty: scenarioDifficulty,
          conversationHistory: history,
        }
      });
      if (!error && data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        setHelpData(parsed);
      } else {
        console.error("Help request failed:", error);
        setHelpData({ explanation: "Sorry, help isn't available right now. Try again in a moment.", suggestedResponse: "", suggestedResponseTranslation: "" });
      }
    } catch (e) {
      console.error("Help request error:", e);
      setHelpData({ explanation: "Something went wrong. Please try again.", suggestedResponse: "", suggestedResponseTranslation: "" });
    }
    setHelpLoading(false);
  }

  const [showExitConfirm, setShowExitConfirm] = useState(false); // Back button confirm

  async function sendScenarioAudio(base64, mimeType) {
    if (!base64 || base64.length > MAX_AUDIO_BASE64_LENGTH) {
      console.error("Scenario audio too large, skipping");
      setScenarioLoading(false);
      return;
    }

    setScenarioLoading(true);
    setStreamingAiText("");

    try {
      const history = scenarioMessagesRef.current.map(m => ({
        role: m.role,
        text: m.text,
      }));

      const elapsedSeconds = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Get user session JWT for auth (supabase.functions.invoke does this internally)
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || supabaseAnonKey;

      // Use raw fetch for SSE streaming (supabase.functions.invoke doesn't support streaming)
      const response = await fetch(`${supabaseUrl}/functions/v1/scenario-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({
          action: "reply-stream",
          difficulty: scenarioDifficulty,
          conversationHistory: history,
          audioBase64: base64,
          mimeType: mimeType,
          elapsedSeconds,
          turnCount: scenarioTurnCount,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let gotTranscript = false;

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }
        if (done) {
          buffer += decoder.decode();
        }

        // Normalize \r\n → \n for consistent parsing
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // SSE events are separated by \n\n — process all complete events
        let eventEnd;
        while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
          const eventBlock = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          for (const line of eventBlock.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr) continue;

            let event;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            // --- Handle SSE event types ---
            if (event.type === "transcript") {
              gotTranscript = true;
              if (event.text && event.text.trim()) {
                const userMsg = { role: "user", text: event.text };
                setScenarioMessages(prev => {
                  const updated = [...prev, userMsg];
                  scenarioMessagesRef.current = updated;
                  return updated;
                });
                setScenarioLoading(false);
              }
            }

            if (event.type === "chunk") {
              accumulatedText += event.text;
              setStreamingAiText(accumulatedText);
            }

            if (event.type === "done") {
              setStreamingAiText("");

              if (event.emptyTranscript) {
                const retryMsg = {
                  role: "ai",
                  text: event.message || "لَمْ أَسْمَعْ شَيْئًا",
                  translation: event.translation || "I didn't hear anything. Please try again.",
                  hint: event.hint || "Make sure to speak clearly into the microphone",
                  keyPhrase: null,
                  isTranslationVisible: true,
                };
                setScenarioMessages(prev => {
                  const updated = [...prev, retryMsg];
                  scenarioMessagesRef.current = updated;
                  return updated;
                });
              } else {
                const aiMsg = {
                  role: "ai",
                  text: event.message || accumulatedText,
                  translation: event.translation || "",
                  hint: event.hint || "",
                  keyPhrase: event.keyPhrase || null,
                  isTranslationVisible: false,
                };
                setScenarioMessages(prev => {
                  const updated = [...prev, aiMsg];
                  scenarioMessagesRef.current = updated;
                  return updated;
                });
                setScenarioTurnCount(prev => prev + 1);

                if (event.keyPhrase) {
                  setScenarioKeyPhrases(prev => [...prev, event.keyPhrase]);
                }

                setHelpData(null);
                if (event.audioBase64) {
                  try {
                    scenarioTtsCache.current[event.message] = event.audioBase64;
                    if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
                    const audio = new Audio(`data:audio/mp3;base64,${event.audioBase64}`);
                    scenarioAudioRef.current = audio;
                    audio.play().catch(e => console.error("Audio play failed:", e));
                  } catch (e) {
                    console.error("TTS playback error:", e);
                  }
                } else {
                  speakAiAudio(event.message || accumulatedText);
                }

                if (event.isEnding) {
                  setTimeout(() => {
                    setScenarioEnded(true);
                    triggerHaptic();
                  }, 1500);
                }
              }
            }

            if (event.type === "error") {
              console.error("SSE error event:", event.message);
              throw new Error(event.message);
            }
          }  // end for (line of eventBlock)
        }  // end while (eventEnd)

        if (done) break;
      }  // end while (true)

    } catch (e) {
      console.error("Scenario reply exception:", e);
      setStreamingAiText("");
      const errorMsg = {
        role: "ai",
        text: "عُذْرًا، حَدَثَ خَطَأٌ. حَاوِلْ مَرَّةً أُخْرَى.",
        translation: "Sorry, something went wrong. Please try again.",
        hint: "Tap the microphone and try again.",
        keyPhrase: null,
        isTranslationVisible: true,
      };
      setScenarioMessages(prev => {
        const updated = [...prev, errorMsg];
        scenarioMessagesRef.current = updated;
        return updated;
      });
    }
    setScenarioLoading(false);
  }

  // Local reset replaces the App.jsx reset
  function resetScenarioChat() {
    onExit();
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { if (scenarioCountdownRef.current) { clearInterval(scenarioCountdownRef.current); scenarioCountdownRef.current = null; } } catch (e) { }
      try {
        if (scenarioRecorderRef.current && scenarioRecorderRef.current.state !== 'inactive') {
          scenarioRecorderRef.current.stop();
          scenarioRecorderRef.current = null;
        }
      } catch (e) { }
      try {
        if (scenarioStreamRef.current) {
          scenarioStreamRef.current.getTracks().forEach(t => t.stop());
          scenarioStreamRef.current = null;
        }
      } catch (e) { }
      try {
        if (scenarioAudioRef.current) {
          scenarioAudioRef.current.pause();
          scenarioAudioRef.current = null;
        }
      } catch (e) { }
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (scenarioChatEndRef.current) {
      scenarioChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scenarioMessages, scenarioLoading, streamingAiText]);

  if (scenarioPhase) {
    // DIFFICULTY SELECTION
    if (scenarioPhase === "difficulty") {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col pt-12">
          <header className="px-6 pb-4 flex items-center gap-4 animate-in fade-in duration-300 z-10">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-12 h-12 rounded-full bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground text-xl" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="font-heading text-xl font-bold">Daily Scenario</h1>
            </div>
            <div className="w-12" />
          </header>

          <main className="flex-1 px-6 space-y-6 overflow-y-auto pb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center py-8 relative">
              <div className="text-6xl mb-4 relative inline-block">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-125 -z-10" />
                {scenarioData?.emoji}
              </div>
              <h2 className="font-heading text-2xl font-bold mb-2">{scenarioData?.title}</h2>
              <p dir="rtl" className="text-xl text-primary font-bold mb-3" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData?.titleAr}</p>
              <p className="text-muted-foreground text-sm">Choose your level and start speaking</p>
            </div>

            <div className="space-y-4">
              {[
                { key: "easy", icon: "solar:leaf-bold", iconColor: "text-green-500", label: "Easy", desc: "Simple words, translations, hints provided", colorClass: "border-green-500" },
                { key: "intermediate", icon: "solar:flame-bold", iconColor: "text-yellow-500", label: "Intermediate", desc: "Natural Arabic, moderate vocab, optional hints", colorClass: "border-yellow-500" },
                { key: "advanced", icon: "solar:bolt-bold", iconColor: "text-red-500", label: "Advanced", desc: "Rich vocabulary, idioms, very challenging", colorClass: "border-red-500" },
              ].map(d => (
                <button
                  key={d.key}
                  className={`w-full bg-card border border-border/50 rounded-3xl p-6 shadow-sm flex items-center gap-5 active:scale-[0.97] transition-transform text-left border-l-4 ${d.colorClass}`}
                  onClick={() => { triggerHaptic(); startScenarioChat(d.key); }}
                >
                  <div className={`text-4xl flex items-center justify-center ${d.iconColor}`}>
                    <Icon icon={d.icon} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">{d.label}</h3>
                    <p className="text-sm text-muted-foreground leading-snug">{d.desc}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <Icon icon="solar:arrow-right-bold" className="text-secondary text-lg" />
                  </div>
                </button>
              ))}
            </div>
          </main>
        </div>
      );
    }

    // BRIEFING SCREEN
    if (scenarioPhase === "briefing") {
      const words = scenarioData?.id ? (scenarioVocab[scenarioData.id] || []) : [];
      const userSetting = scenarioData?.id ? (scenarioContext[scenarioData.id] || scenarioData?.setting) : scenarioData?.setting;

      return (
        <div className="min-h-screen bg-background text-foreground font-sans relative flex flex-col pt-12">
          <header className="px-6 pb-6 flex items-center justify-between z-10 w-full flex-shrink-0">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-12 h-12 rounded-full bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center animate-in fade-in duration-300 shadow-sm active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground text-xl" />
            </button>
            {scenarioLoading ? (
              <div className="bg-muted rounded-full px-5 py-2.5 border border-border/50 flex flex-row items-center gap-3 animate-in fade-in duration-300 shadow-sm">
                <Leapfrog size="24" speed="2.5" color="var(--primary)" />
                <span className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Connecting</span>
              </div>
            ) : (
              <div className="bg-green-500/10 rounded-full px-5 py-2.5 border border-green-500/30 flex flex-row items-center gap-2 animate-in fade-in duration-300 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-600 dark:text-green-400 text-sm font-bold uppercase tracking-widest">Ready</span>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-6 pb-6 z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both space-y-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="text-8xl mb-6 relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 -z-10" />
                {scenarioData?.emoji}
              </div>
              <h1 className="font-heading text-3xl font-bold mb-2 text-foreground">{scenarioData?.title}</h1>
              <p dir="rtl" className="text-xl text-primary font-bold" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData?.titleAr}</p>
            </div>

            <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
                  <Icon icon="solar:info-square-bold" className="text-2xl" />
                </div>
                <h3 className="font-heading text-xl font-bold">Situation Overview</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed text-base">{userSetting || "Get ready to practice your Arabic in this real-life scenario."}</p>
            </div>

            {words.length > 0 && (
              <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon icon="solar:book-bookmark-bold" className="text-2xl" />
                  </div>
                  <h3 className="font-heading text-xl font-bold">Useful Words</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {words.map((w, idx) => (
                    <button key={idx} className="bg-background border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 active:scale-95 transition-all w-full hover:border-primary/50 shadow-sm" onClick={() => { triggerHaptic(); speakAiAudio(w.ar); }}>
                      <span dir="rtl" className="text-xl font-bold text-foreground" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{w.ar}</span>
                      <span className="text-sm text-muted-foreground font-medium">{w.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 pb-8 z-10 w-full pt-4 bg-background">
            <button
              disabled={scenarioLoading}
              onClick={() => {
                triggerHaptic();
                setScenarioPhase("chat");
                if (scenarioMessages.length > 0) {
                  setTimeout(() => speakAiAudio(scenarioMessages[0].text), 300);
                }
              }}
              className="w-full h-16 rounded-[2rem] font-bold text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.97]"
              style={{
                background: scenarioLoading ? 'var(--muted)' : 'var(--primary)',
                color: scenarioLoading ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                boxShadow: scenarioLoading ? 'none' : '0 8px 30px rgba(var(--primary-rgb, 139, 92, 246), 0.3)',
              }}
            >
              {scenarioLoading ? (
                <>
                  <Leapfrog size="24" speed="2.5" color="currentColor" />
                  <span>Preparing Scenario...</span>
                </>
              ) : (
                <>
                  <span>Ready to Practice!</span>
                  <Icon icon="solar:arrow-right-bold" className="text-2xl" />
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    // CHAT SCREEN
    if (scenarioPhase === "chat") {
      const lastAi = [...scenarioMessages].reverse().find(m => m.role === 'ai');
      const elapsedSec = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
      const timeRemaining = Math.max(0, 300 - elapsedSec);
      const showTimeWarning = timeRemaining > 0 && timeRemaining <= 60 && !scenarioLoading;
      return (
        <div className="bg-background text-foreground font-sans flex flex-col h-screen overflow-hidden relative">

          {/* 60s Time Warning Toast */}
          <AnimatePresence>
            {showTimeWarning && (
              <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="absolute top-20 left-4 right-4 z-50 bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl p-4 shadow-lg backdrop-blur-md flex items-center justify-center gap-3"
              >
                <Icon icon="solar:alarm-bold" className="text-2xl animate-pulse" />
                <span className="font-bold text-sm">1 minute remaining — wrap up your conversation!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Exit Confirmation Modal */}
          {showExitConfirm && (
            <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => setShowExitConfirm(false)}>
              <div className="bg-card rounded-3xl p-6 max-w-sm w-full border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-heading text-lg font-bold mb-2">Leave conversation?</h3>
                <p className="text-sm text-muted-foreground mb-6">Your progress in this scenario won't be saved.</p>
                <div className="flex gap-3">
                  <button
                    className="flex-1 py-3 rounded-xl border border-border font-bold text-sm text-foreground bg-muted active:scale-[0.97] transition-all"
                    onClick={() => { triggerHaptic(); setShowExitConfirm(false); }}
                  >
                    Stay
                  </button>
                  <button
                    className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-destructive active:scale-[0.97] transition-all"
                    onClick={() => { triggerHaptic(); setShowExitConfirm(false); resetScenarioChat(); }}
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <header className="px-5 pt-12 pb-4 flex items-center gap-4 bg-background z-10 flex-shrink-0 shadow-sm">
            <button onClick={() => { triggerHaptic(); setShowExitConfirm(true); }} className="w-10 h-10 rounded-full bg-card/80 border border-border/50 flex items-center justify-center active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{scenarioData?.emoji}</span>
                <h1 className="font-heading text-lg font-bold">{scenarioData?.title}</h1>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border border-border/50" style={{
                  color: scenarioDifficulty === 'easy' ? '#22c55e' : scenarioDifficulty === 'intermediate' ? '#eab308' : '#ef4444',
                  backgroundColor: scenarioDifficulty === 'easy' ? 'rgba(34,197,94,0.1)' : scenarioDifficulty === 'intermediate' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
                }}>{scenarioDifficulty === 'intermediate' ? 'Medium' : scenarioDifficulty === 'easy' ? 'Easy' : 'Hard'}</span>
                {timeRemaining <= 60 && (
                  <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 animate-pulse">
                    <Icon icon="solar:clock-circle-bold" />
                    {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 z-0">
            {scenarioMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50'}`}
                  style={{
                    maxWidth: '85%',
                    padding: '1rem',
                    borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : '1.5rem 1.5rem 1.5rem 0.25rem',
                  }}
                >
                  <div dir="rtl" className="text-lg leading-relaxed font-semibold" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>
                    {msg.text}
                  </div>
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
                      {msg.translation && (
                        msg.isTranslationVisible ? (
                          <p className="text-xs text-muted-foreground italic flex-1 leading-normal">{msg.translation}</p>
                        ) : (
                          <button
                            onClick={() => {
                              triggerHaptic();
                              setScenarioMessages(prev => prev.map((m, idx) => idx === i ? { ...m, isTranslationVisible: true } : m));
                            }}
                            className="text-xs text-primary font-bold flex-1 text-left py-2 active:opacity-70 transition-opacity"
                          >
                            Show translation
                          </button>
                        )
                      )}
                      
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(msg.text); }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all flex-shrink-0 ${
                          playingAudioUrl === msg.text ? "bg-secondary/20 text-secondary" : "bg-secondary/10 text-secondary"
                        }`}
                      >
                        <Icon 
                          icon={playingAudioUrl === msg.text ? "solar:pause-bold" : "solar:volume-loud-bold"} 
                          className="text-xl" 
                        />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming AI reply — typewriter effect */}
            {streamingAiText && (
              <div className="flex justify-start">
                <div
                  className="bg-card border border-border/50 shadow-sm"
                  style={{
                    maxWidth: '85%',
                    padding: '1rem',
                    borderRadius: '1.5rem 1.5rem 1.5rem 0.25rem',
                  }}
                >
                  <div dir="rtl" className="text-lg leading-relaxed font-semibold" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>
                    {streamingAiText}
                    <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse align-text-bottom" />
                  </div>
                </div>
              </div>
            )}

            {scenarioLoading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border/50 shadow-sm" style={{ padding: '1rem', borderRadius: '1.5rem 1.5rem 1.5rem 0.25rem' }}>
                  <Leapfrog size="24" speed="2.5" color="var(--primary)" />
                </div>
              </div>
            )}
            <div ref={scenarioChatEndRef} />
          </div>

          {/* Bottom Panel */}
          <div className={`bg-card border-t border-border/50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex-shrink-0 flex flex-col relative z-20 pb-safe transition-all duration-500 ${scenarioRecording ? 'bg-red-500/10 scale-[1.02] shadow-[0_-15px_50px_rgba(239,68,68,0.2)]' : ''}`}>

            <div className="flex-1 overflow-y-auto max-h-[40vh] px-5 pt-4 pb-2 scrollbar-hide">
              {/* Hint — always shown if available */}
              {lastAi?.hint && !scenarioLoading && (
                <p className="text-sm text-primary font-medium text-center mb-3">
                  <Icon icon="solar:chat-round-dots-bold" className="inline mr-1.5 text-lg align-text-bottom" />
                  {lastAi.hint}
                </p>
              )}

              {/* Help Button or Help Content */}
              {!scenarioLoading && lastAi && !scenarioEnded && (
                <div className="mb-4">
                  {!helpData && !helpLoading && (
                    <button
                      onClick={requestHelp}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl transition-all active:scale-[0.98] bg-secondary/10 text-secondary font-bold text-sm"
                    >
                      <Icon icon="solar:lightbulb-bold" className="text-lg" />
                      <span>Need Help?</span>
                    </button>
                  )}

                  {helpLoading && (
                    <div className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-secondary/10">
                      <Leapfrog size="20" speed="2.5" color="var(--secondary)" />
                      <span className="text-sm text-secondary font-bold">Getting help...</span>
                    </div>
                  )}

                  {helpData && (
                    <div className="bg-background border border-border/50 rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in duration-300">
                      {/* Explanation */}
                      <p className="text-sm text-foreground leading-relaxed">
                        {helpData.explanation}
                      </p>

                      {/* Suggested Response */}
                      {helpData.suggestedResponse && (
                        <div className="bg-card border border-primary/20 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Try saying</span>
                            <button
                              onClick={() => { triggerHaptic(); speakAiAudio(helpData.suggestedResponse); }}
                              className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 text-primary active:scale-95 transition-transform"
                            >
                              <Icon icon="solar:volume-loud-bold" className="text-lg" />
                            </button>
                          </div>
                          <div dir="rtl" className="text-xl leading-relaxed font-bold text-primary text-right" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>
                            {helpData.suggestedResponse}
                          </div>
                          {helpData.suggestedResponseTranslation && (
                            <p className="text-sm text-muted-foreground italic mt-1">{helpData.suggestedResponseTranslation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mic Area */}
            <div className="px-6 pb-8 pt-4 flex flex-col items-center gap-4 bg-card">
              {scenarioEnded ? (
                <button
                  onClick={() => {
                    triggerHaptic();
                    setScenarioPhase("summary");
                    if (onComplete) onComplete();
                  }}
                  className="w-full h-16 rounded-[2rem] font-bold text-base uppercase tracking-widest text-white flex items-center justify-center gap-3 active:scale-[0.97] transition-all shadow-[0_8px_30px_rgba(34,197,94,0.3)] bg-gradient-to-r from-green-500 to-emerald-500"
                >
                  <span>Finish & Review</span>
                  <Icon icon="solar:check-circle-bold" className="text-2xl" />
                </button>
              ) : (
                <>
                  {/* Recording Timer Bar — only visible while recording */}
                  {scenarioRecording && (
                    <div className="w-full max-w-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          Recording
                        </span>
                        <span className="text-xs font-mono font-bold text-muted-foreground">
                          {scenarioRecordingSeconds}s / 45s
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-linear"
                          style={{
                            width: `${(scenarioRecordingSeconds / 45) * 100}%`,
                            background: scenarioRecordingSeconds >= 35 ? '#ef4444' : scenarioRecordingSeconds >= 25 ? '#eab308' : 'var(--primary)',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Mic Button — simple tap toggle */}
                  <button
                    onClick={() => {
                      if (scenarioRecording) {
                        stopScenarioRecording();
                      } else if (!scenarioLoading) {
                        startScenarioRecording();
                      }
                    }}
                    disabled={scenarioLoading}
                    className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 text-white select-none ${scenarioRecording
                        ? 'bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                        : scenarioLoading
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary active:scale-95'
                      }`}
                  >
                    <Icon
                      icon={scenarioLoading ? "solar:hourglass-bold" : scenarioRecording ? "solar:stop-bold" : "solar:microphone-bold"}
                      className="text-4xl"
                    />
                  </button>

                  {/* Label */}
                  <p className="text-center text-xs text-muted-foreground font-medium">
                    {scenarioRecording ? 'Tap to stop' : scenarioLoading ? 'Getting reply...' : 'Tap to speak'}
                  </p>
                </>
              )}
            </div>

          </div>
        </div>
      );
    }

    // SUMMARY SCREEN
    if (scenarioPhase === "summary") {
      const elapsedSec = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;

      return (
        <div className="min-h-screen bg-background text-foreground font-sans relative" style={{ background: 'linear-gradient(180deg, rgba(34,197,94,0.1) 0%, var(--background) 50%)' }}>

          <div className="absolute top-10 left-0 w-full flex justify-center pointer-events-none z-0">
            <DotLottieReact src="/animations/done.lottie" loop autoplay style={{ width: 180, height: 180, opacity: 0.15 }} />
          </div>

          <main className="px-6 pt-16 pb-12 space-y-8 z-10 relative animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center pt-8">
              <div className="text-8xl mb-6 relative inline-block">
                <div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full scale-150 -z-10" />
                🎉
              </div>
              <h1 className="font-heading text-4xl font-bold mb-3 text-foreground">Complete!</h1>
              <p className="text-muted-foreground text-lg mb-4">Great job practicing your Arabic!</p>

              <div className="inline-flex items-center gap-3 bg-card border border-border/50 px-5 py-2.5 rounded-full shadow-sm">
                <span className="text-xl">{scenarioData?.emoji}</span>
                <span className="text-base font-bold">{scenarioData?.title}</span>
                <span className="text-sm text-muted-foreground font-semibold px-2 border-l border-border/50 capitalize">{scenarioDifficulty}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center">
                <Icon icon="solar:chat-round-line-bold" className="text-3xl text-primary mb-2" />
                <span className="text-2xl font-bold">{scenarioTurnCount}</span>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Turns Taken</span>
              </div>
              <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center">
                <Icon icon="solar:clock-circle-bold" className="text-3xl text-secondary mb-2" />
                <span className="text-2xl font-bold">{mins > 0 ? `${mins}m ` : ''}{secs}s</span>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Time Spent</span>
              </div>
            </div>

            {scenarioKeyPhrases.length > 0 && (
              <section className="bg-card/40 border border-border/50 rounded-3xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Icon icon="solar:star-fall-bold" className="text-2xl" />
                  </div>
                  <h2 className="font-heading text-xl font-bold">Key Phrases Learned</h2>
                </div>
                <div className="space-y-4">
                  {scenarioKeyPhrases.map((kp, i) => (
                    <div key={i} className="bg-background rounded-2xl p-5 border border-border/50 flex items-center gap-4 shadow-sm">
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(kp.arabic); }}
                        className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center cursor-pointer active:scale-95 transition-transform flex-shrink-0"
                      >
                        <Icon icon="solar:volume-loud-bold" className="text-2xl" />
                      </button>
                      <div className="flex-1">
                        <div dir="rtl" className="text-xl font-bold text-primary mb-1" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{kp.arabic}</div>
                        <div className="text-sm text-muted-foreground font-semibold">{kp.english}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <button
              className="w-full h-16 rounded-[2rem] font-bold text-base uppercase tracking-widest text-white mt-8 flex items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', boxShadow: '0 8px 30px rgba(var(--primary-rgb, 139, 92, 246), 0.3)' }}
              onClick={() => { triggerHaptic(); resetScenarioChat(); }}
            >
              <span>Back to Home</span>
              <Icon icon="solar:home-2-bold" className="text-2xl" />
            </button>
          </main>
        </div>
      );
    }
  }

  return null;
}
