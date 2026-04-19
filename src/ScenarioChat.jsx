import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { MdArrowBackIosNew } from "react-icons/md";
import { motion, AnimatePresence } from "motion/react";
import { Leapfrog } from 'ldrs/react';
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import 'ldrs/react/Leapfrog.css';
import { App as CapacitorApp } from '@capacitor/app';

const MAX_AUDIO_BASE64_LENGTH = 5 * 1024 * 1024;

// ===== Scenario Sound Effects =====
let _scenarioAudioCtx = null;
const getScenarioAudioCtx = () => {
  if (!_scenarioAudioCtx || _scenarioAudioCtx.state === 'closed') {
    _scenarioAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_scenarioAudioCtx.state === 'suspended') _scenarioAudioCtx.resume();
  return _scenarioAudioCtx;
};

// Soft "message received" chime — gentle rising tone
const playReceiveSound = () => {
  try {
    const ctx = getScenarioAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
  } catch (e) { }
};

// "Message sent" pop — quick soft thud
const playSendSound = () => {
  try {
    const ctx = getScenarioAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.05);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.06);
  } catch (e) { }
};

// Recording start beep
const playRecordStartSound = () => {
  try {
    const ctx = getScenarioAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
  } catch (e) { }
};

// Recording stop beep — lower
const playRecordStopSound = () => {
  try {
    const ctx = getScenarioAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
  } catch (e) { }
};

// Force audio routing back to media channel after getUserMedia releases
// Android WebView switches to phone/communication channel during recording
// Play a short silent audio clip at low volume to reclaim the media audio route
const resetAudioRouteToMedia = () => {
  try {
    const silence = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQAAAAAAAAAAAGwjp+ungAAAAAAAAAAAAAAAAAAAAD/4zgAAAAAAAAAAABJbmZvAAAADwAAAAMAAAGwAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqtXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1f///////////////////////////////////////////wAAAABMYXZjNTguMTMAAAAAAAAAAAAAAACkAAAAAAAAAAAAAbCOn6+eAAAAAAAAAAAAAAAAAAAA");
    silence.volume = 0.01;
    silence.play().then(() => {
      setTimeout(() => { silence.pause(); silence.remove(); }, 500);
    }).catch(() => {});
    // Play a second one after a short delay to ensure the route switches
    setTimeout(() => {
      try {
        const silence2 = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQAAAAAAAAAAAGwjp+ungAAAAAAAAAAAAAAAAAAAAD/4zgAAAAAAAAAAABJbmZvAAAADwAAAAMAAAGwAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqtXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1f///////////////////////////////////////////wAAAABMYXZjNTguMTMAAAAAAAAAAAAAAACkAAAAAAAAAAAAAbCOn6+eAAAAAAAAAAAAAAAAAAAA");
        silence2.volume = 0.01;
        silence2.play().then(() => {
          setTimeout(() => { silence2.pause(); silence2.remove(); }, 500);
        }).catch(() => {});
      } catch (e) {}
    }, 200);
  } catch (e) { }
};

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
  "cafe": [{ ar: "قهوة", en: "Coffee" }, { ar: "شاي", en: "Tea" }, { ar: "حليب", en: "Milk" }, { ar: "حساب", en: "Bill" }, { ar: "سكر", en: "Sugar" }, { ar: "كعكة", en: "Cake" }, { ar: "فنجان", en: "Cup" }, { ar: "بارد", en: "Cold" }, { ar: "ساخن", en: "Hot" }],
  "restaurant": [{ ar: "طاولة", en: "Table" }, { ar: "قائمة", en: "Menu" }, { ar: "لذيذ", en: "Delicious" }, { ar: "دجاج", en: "Chicken" }, { ar: "ماء", en: "Water" }, { ar: "لحم", en: "Meat" }, { ar: "أرز", en: "Rice" }, { ar: "سلطة", en: "Salad" }, { ar: "حلوى", en: "Dessert" }],
  "groceries": [{ ar: "فواكه", en: "Fruits" }, { ar: "خضار", en: "Vegetables" }, { ar: "كم السعر", en: "How much?" }, { ar: "خبز", en: "Bread" }, { ar: "طماطم", en: "Tomato" }, { ar: "بيض", en: "Eggs" }, { ar: "حليب", en: "Milk" }, { ar: "كيس", en: "Bag" }, { ar: "طازج", en: "Fresh" }],
  "hotel": [{ ar: "غرفة", en: "Room" }, { ar: "حجز", en: "Reservation" }, { ar: "ليلة", en: "Night" }, { ar: "مفتاح", en: "Key" }, { ar: "جواز سفر", en: "Passport" }, { ar: "سرير", en: "Bed" }, { ar: "إفطار", en: "Breakfast" }, { ar: "طابق", en: "Floor" }, { ar: "مصعد", en: "Elevator" }],
  "airport": [{ ar: "جواز سفر", en: "Passport" }, { ar: "تذكرة", en: "Ticket" }, { ar: "حقيبة", en: "Bag" }, { ar: "رحلة", en: "Flight" }, { ar: "طائرة", en: "Airplane" }, { ar: "بوابة", en: "Gate" }, { ar: "مغادرة", en: "Departure" }, { ar: "وصول", en: "Arrival" }, { ar: "مقعد", en: "Seat" }],
  "directions": [{ ar: "أين", en: "Where" }, { ar: "يمين", en: "Right" }, { ar: "يسار", en: "Left" }, { ar: "طريق", en: "Road" }, { ar: "مسجد", en: "Mosque" }, { ar: "قريب", en: "Near" }, { ar: "بعيد", en: "Far" }, { ar: "شارع", en: "Street" }, { ar: "أمام", en: "In front" }],
  "market": [{ ar: "سعر", en: "Price" }, { ar: "غالي", en: "Expensive" }, { ar: "رخيص", en: "Cheap" }, { ar: "أريد", en: "I want" }, { ar: "ممكن", en: "Is it possible" }, { ar: "تفضل", en: "Here you go" }, { ar: "كيلو", en: "Kilo" }, { ar: "بهارات", en: "Spices" }, { ar: "خصم", en: "Discount" }],
  "clothes": [{ ar: "قميص", en: "Shirt" }, { ar: "سروال", en: "Pants" }, { ar: "مقاس", en: "Size" }, { ar: "لون", en: "Color" }, { ar: "حذاء", en: "Shoes" }, { ar: "أكبر", en: "Larger" }, { ar: "أصغر", en: "Smaller" }, { ar: "فستان", en: "Dress" }, { ar: "جاكيت", en: "Jacket" }],
  "bookstore": [{ ar: "كتاب", en: "Book" }, { ar: "قصة", en: "Story" }, { ar: "قراءة", en: "Reading" }, { ar: "قاموس", en: "Dictionary" }, { ar: "عربي", en: "Arabic" }, { ar: "لغة", en: "Language" }, { ar: "صفحة", en: "Page" }, { ar: "مؤلف", en: "Author" }, { ar: "رف", en: "Shelf" }],
  "meeting": [{ ar: "اسمي", en: "My name" }, { ar: "تشرفنا", en: "Nice to meet you" }, { ar: "طالب", en: "Student" }, { ar: "من أين", en: "From where" }, { ar: "عمل", en: "Work" }, { ar: "جامعة", en: "University" }, { ar: "بلد", en: "Country" }, { ar: "هواية", en: "Hobby" }, { ar: "سعيد", en: "Happy" }],
  "invitation": [{ ar: "دعوة", en: "Invitation" }, { ar: "متى", en: "When" }, { ar: "وقت", en: "Time" }, { ar: "موعد", en: "Appointment" }, { ar: "غداً", en: "Tomorrow" }, { ar: "عشاء", en: "Dinner" }, { ar: "مكان", en: "Place" }, { ar: "ضيوف", en: "Guests" }, { ar: "طعام", en: "Food" }],
  "family": [{ ar: "عائلة", en: "Family" }, { ar: "أخ", en: "Brother" }, { ar: "أخت", en: "Sister" }, { ar: "كيف حال", en: "How is..." }, { ar: "أب", en: "Father" }, { ar: "أم", en: "Mother" }, { ar: "جد", en: "Grandfather" }, { ar: "أطفال", en: "Children" }, { ar: "زوجة", en: "Wife" }],
  "pharmacy": [{ ar: "صيدلية", en: "Pharmacy" }, { ar: "دواء", en: "Medicine" }, { ar: "مريض", en: "Sick" }, { ar: "ألم", en: "Pain" }, { ar: "صداع", en: "Headache" }, { ar: "طبيب", en: "Doctor" }, { ar: "حرارة", en: "Fever" }, { ar: "وصفة", en: "Prescription" }, { ar: "حبوب", en: "Pills" }],
  "taxi": [{ ar: "سيارة أجرة", en: "Taxi" }, { ar: "إلى أين", en: "Where to" }, { ar: "مطار", en: "Airport" }, { ar: "توقف", en: "Stop" }, { ar: "عنوان", en: "Address" }, { ar: "هنا", en: "Here" }, { ar: "كم", en: "How much" }, { ar: "سريع", en: "Fast" }, { ar: "شارع", en: "Street" }],
  "bank": [{ ar: "بنك", en: "Bank" }, { ar: "نقود", en: "Money" }, { ar: "حساب", en: "Account" }, { ar: "صرف", en: "Exchange" }, { ar: "دولار", en: "Dollar" }, { ar: "بطاقة", en: "Card" }, { ar: "سحب", en: "Withdraw" }, { ar: "إيداع", en: "Deposit" }, { ar: "رصيد", en: "Balance" }],
  "school": [{ ar: "مدرسة", en: "School" }, { ar: "معلم", en: "Teacher" }, { ar: "صف", en: "Class" }, { ar: "درس", en: "Lesson" }, { ar: "كتاب", en: "Book" }, { ar: "سؤال", en: "Question" }, { ar: "واجب", en: "Homework" }, { ar: "امتحان", en: "Exam" }, { ar: "قلم", en: "Pen" }],
  "gym": [{ ar: "نادي", en: "Gym" }, { ar: "رياضة", en: "Sport" }, { ar: "وزن", en: "Weight" }, { ar: "تدريب", en: "Training" }, { ar: "صحة", en: "Health" }, { ar: "اشتراك", en: "Subscription" }, { ar: "عضلات", en: "Muscles" }, { ar: "جري", en: "Running" }, { ar: "مدرب", en: "Trainer" }],
  "doctor": [{ ar: "طبيب", en: "Doctor" }, { ar: "مستشفى", en: "Hospital" }, { ar: "موعد", en: "Appointment" }, { ar: "علاج", en: "Treatment" }, { ar: "ألم", en: "Pain" }, { ar: "مريض", en: "Sick" }, { ar: "فحص", en: "Checkup" }, { ar: "دواء", en: "Medicine" }, { ar: "راحة", en: "Rest" }],
  "library": [{ ar: "مكتبة", en: "Library" }, { ar: "استعارة", en: "Borrow" }, { ar: "هدوء", en: "Quiet" }, { ar: "بطاقة", en: "Card" }, { ar: "كتاب", en: "Book" }, { ar: "قراءة", en: "Read" }, { ar: "رف", en: "Shelf" }, { ar: "إعادة", en: "Return" }, { ar: "مقعد", en: "Seat" }],
  "bakery": [{ ar: "مخبز", en: "Bakery" }, { ar: "خبز", en: "Bread" }, { ar: "حلوى", en: "Sweets" }, { ar: "طازج", en: "Fresh" }, { ar: "كعكة", en: "Cake" }, { ar: "لذيذ", en: "Delicious" }, { ar: "معجنات", en: "Pastries" }, { ar: "فرن", en: "Oven" }, { ar: "قطعة", en: "Piece" }],
  "phone": [{ ar: "هاتف", en: "Phone" }, { ar: "شاشة", en: "Screen" }, { ar: "تصليح", en: "Repair" }, { ar: "شاحن", en: "Charger" }, { ar: "جديد", en: "New" }, { ar: "مشكلة", en: "Problem" }, { ar: "غلاف", en: "Case" }, { ar: "كاميرا", en: "Camera" }, { ar: "ضمان", en: "Warranty" }],
  "park": [{ ar: "حديقة", en: "Park" }, { ar: "طقس", en: "Weather" }, { ar: "جميل", en: "Beautiful" }, { ar: "جلوس", en: "Sitting" }, { ar: "أشجار", en: "Trees" }, { ar: "مشمس", en: "Sunny" }, { ar: "هواء", en: "Air" }, { ar: "زهور", en: "Flowers" }, { ar: "مشي", en: "Walking" }],
  "post_office": [{ ar: "بريد", en: "Post" }, { ar: "رسالة", en: "Letter" }, { ar: "طابع", en: "Stamp" }, { ar: "عنوان", en: "Address" }, { ar: "طرد", en: "Package" }, { ar: "إرسال", en: "Send" }, { ar: "استلام", en: "Receive" }, { ar: "وزن", en: "Weight" }, { ar: "نموذج", en: "Form" }],
  "barber": [{ ar: "حلاق", en: "Barber" }, { ar: "شعر", en: "Hair" }, { ar: "قص", en: "Cut" }, { ar: "قصير", en: "Short" }, { ar: "طويل", en: "Long" }, { ar: "لحية", en: "Beard" }, { ar: "مرآة", en: "Mirror" }, { ar: "مشط", en: "Comb" }, { ar: "تسريحة", en: "Hairstyle" }],
  "neighbor": [{ ar: "جار", en: "Neighbor" }, { ar: "بيت", en: "House" }, { ar: "جديد", en: "New" }, { ar: "منطقة", en: "Area" }, { ar: "أهلاً", en: "Welcome" }, { ar: "مساعدة", en: "Help" }, { ar: "شارع", en: "Street" }, { ar: "هادئ", en: "Quiet" }, { ar: "سوق", en: "Market" }],
  "travel_agent": [{ ar: "سفر", en: "Travel" }, { ar: "طائرة", en: "Airplane" }, { ar: "فندق", en: "Hotel" }, { ar: "عطلة", en: "Holiday" }, { ar: "دولار", en: "Dollar" }, { ar: "تذكرة", en: "Ticket" }, { ar: "شاطئ", en: "Beach" }, { ar: "جبل", en: "Mountain" }, { ar: "برنامج", en: "Program" }],
  "mechanic": [{ ar: "ميكانيكي", en: "Mechanic" }, { ar: "سيارة", en: "Car" }, { ar: "مشكلة", en: "Problem" }, { ar: "إصلاح", en: "Fix" }, { ar: "محرك", en: "Engine" }, { ar: "زيت", en: "Oil" }, { ar: "إطار", en: "Tire" }, { ar: "فرامل", en: "Brakes" }, { ar: "تكلفة", en: "Cost" }],
  "birthday": [{ ar: "عيد ميلاد", en: "Birthday" }, { ar: "هدية", en: "Gift" }, { ar: "عمر", en: "Age" }, { ar: "مبروك", en: "Congratulations" }, { ar: "سنة", en: "Year" }, { ar: "حفلة", en: "Party" }, { ar: "شموع", en: "Candles" }, { ar: "أغنية", en: "Song" }, { ar: "صديق", en: "Friend" }],
  "rent": [{ ar: "شقة", en: "Apartment" }, { ar: "إيجار", en: "Rent" }, { ar: "شهر", en: "Month" }, { ar: "عقد", en: "Contract" }, { ar: "غرفة", en: "Room" }, { ar: "مفتاح", en: "Key" }, { ar: "مطبخ", en: "Kitchen" }, { ar: "حمام", en: "Bathroom" }, { ar: "شرفة", en: "Balcony" }],
  "wedding": [{ ar: "زفاف", en: "Wedding" }, { ar: "عروس", en: "Bride" }, { ar: "عريس", en: "Groom" }, { ar: "احتفال", en: "Celebration" }, { ar: "مبروك", en: "Congratulations" }, { ar: "جميل", en: "Beautiful" }, { ar: "موسيقى", en: "Music" }, { ar: "رقص", en: "Dancing" }, { ar: "ضيوف", en: "Guests" }],
};

export default function ScenarioChat({
  scenarioData,
  user,
  markScenarioCompletedForToday,
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
  const [scenarioFinalElapsed, setScenarioFinalElapsed] = useState(null); // Frozen time for summary
  const [streamingAiText, setStreamingAiText] = useState("");
  const [displayedStreamText, setDisplayedStreamText] = useState("");

  const [playingAudioUrl, setPlayingAudioUrl] = useState(null); // Track which audio is playing
  const [scenarioVoice, setScenarioVoice] = useState(null); // Track assigned TTS voice

  // Smooth typewriter: reveal streamingAiText character by character
  const streamTargetRef = useRef("");
  const typewriterRef = useRef(null);

  useEffect(() => {
    streamTargetRef.current = streamingAiText;

    if (!streamingAiText) {
      // Stream ended — clear displayed text and stop interval
      if (typewriterRef.current) { clearInterval(typewriterRef.current); typewriterRef.current = null; }
      setDisplayedStreamText("");
      return;
    }

    // Start the typewriter interval if not already running
    if (!typewriterRef.current) {
      typewriterRef.current = setInterval(() => {
        setDisplayedStreamText(prev => {
          const target = streamTargetRef.current;
          if (!target) {
            clearInterval(typewriterRef.current);
            typewriterRef.current = null;
            return "";
          }
          if (prev.length >= target.length) return prev;
          // Reveal 1-3 characters per tick for a natural feel
          const charsToAdd = Math.min(2, target.length - prev.length);
          return target.slice(0, prev.length + charsToAdd);
        });
      }, 20);
    }

    return () => {};
  }, [streamingAiText]);

  // Cleanup typewriter on unmount
  useEffect(() => {
    return () => {
      if (typewriterRef.current) { clearInterval(typewriterRef.current); typewriterRef.current = null; }
    };
  }, []);

  const scenarioRecorderRef = useRef(null);
  const scenarioStreamRef = useRef(null);
  const scenarioChunksRef = useRef([]);
  const scenarioChatEndRef = useRef(null);
  const scenarioMessagesRef = useRef([]);
  const scenarioAudioRef = useRef(null);
  const scenarioStartTimeRef = useRef(null);
  const scenarioCountdownRef = useRef(null);
  const scenarioTtsCache = useRef({});
  const scenarioHelpCache = useRef({}); // Cache help responses keyed by last AI message text
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const maxAudioLevelRef = useRef(0); // Track peak audio level during recording
  const speechFramesRef = useRef(0); // Count frames with significant audio (sustained speech detection)


  const speakArabic = (text) => {
    try { window.speechSynthesis.cancel(); } catch (e) { }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA';
      u.rate = 0.8;
      const voices = window.speechSynthesis?.getVoices?.() || [];
      const arabicVoice = voices.find(v => v.lang?.toLowerCase().startsWith('ar'));
      if (arabicVoice) u.voice = arabicVoice;
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
      // If same audio is playing, restart from beginning
      if (scenarioAudioRef.current && playingAudioUrl === text) {
        scenarioAudioRef.current.currentTime = 0;
        scenarioAudioRef.current.play().catch(() => {});
        setPlayingAudioUrl(text);
        return;
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
    keyPhrasesFetchedRef.current = false;
    scenarioStartTimeRef.current = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: { action: "start", difficulty, turnCount: 0 }
      });
      console.log('Scenario start raw:', { data, error });
      // Handle rate limit
      if (data?.error === "daily_limit") {
        setScenarioMessages([{
          role: "ai",
          text: data.message || "You've reached your daily limit. Come back tomorrow!",
          translation: "",
          hint: "",
          keyPhrase: null,
          isTranslationVisible: false,
          isRateLimit: true,
        }]);
        setScenarioLoading(false);
        return;
      }
      if (!error && data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        console.log('Scenario start parsed:', parsed);
        if (parsed.message) {
          const aiMsg = {
            role: "ai",
            text: parsed.message,
            translation: "",
            hint: "",
            keyPhrase: parsed.keyPhrase || null,
            isTranslationVisible: false,
          };
          setScenarioMessages([aiMsg]);
          scenarioMessagesRef.current = [aiMsg];
          if (parsed.keyPhrase) {
            setScenarioKeyPhrases(prev => prev.length >= 5 ? prev : [...prev, parsed.keyPhrase]);
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
    // Enforce 4-minute time limit — don't allow new recordings past 240s
    const elapsed = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
    if (elapsed >= 240) {
      setScenarioFinalElapsed(elapsed);
      setScenarioEnded(true);
      triggerHaptic();
      return;
    }

    try {
      // Request microphone permission explicitly first
      try {
        const permResult = await navigator.permissions.query({ name: 'microphone' });
        if (permResult.state === 'denied') {
          console.error("Microphone permission denied.");
          return;
        }
      } catch (permErr) {
        console.log('Permissions API not supported, will request via getUserMedia');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      scenarioChunksRef.current = [];
      scenarioStreamRef.current = stream;

      // Set up audio level monitoring to detect actual speech
      maxAudioLevelRef.current = 0;
      speechFramesRef.current = 0;
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const monitorLevel = () => {
          if (!analyserRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          if (avg > maxAudioLevelRef.current) maxAudioLevelRef.current = avg;
          // Count frames with meaningful audio level (sustained speech detection)
          if (avg > 12) speechFramesRef.current++;
          requestAnimationFrame(monitorLevel);
        };
        monitorLevel();
      } catch (e) {
        console.warn("Audio analysis not available:", e);
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      scenarioRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          scenarioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop audio analysis
        analyserRef.current = null;
        if (audioContextRef.current) {
          try { audioContextRef.current.close(); } catch (e) {}
          audioContextRef.current = null;
        }
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(t => t.stop());
        scenarioStreamRef.current = null;
        // Force Android back to media audio channel after mic release
        resetAudioRouteToMedia();

        // If no speech detected: peak too low OR not enough sustained audio frames
        // ~60 frames/sec via requestAnimationFrame, so 30 frames ≈ 0.5s of speech
        if (maxAudioLevelRef.current < 12 || speechFramesRef.current < 30) {
          playReceiveSound();
          const silenceMsg = {
            role: "ai",
            text: "لَمْ أَسْمَعْ شَيْئًا. هَلْ يُمْكِنُكَ تَكْرَارُ ذَلِكَ مِنْ فَضْلِكَ؟",
            translation: "I didn't hear anything. Can you repeat that please?",
            hint: "Speak clearly into the microphone and try again.",
            keyPhrase: null,
            isTranslationVisible: true,
          };
          setScenarioMessages(prev => {
            const updated = [...prev, silenceMsg];
            scenarioMessagesRef.current = updated;
            return updated;
          });
          setScenarioLoading(false);
          return;
        }

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
      playRecordStartSound();

      if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
      window.speechSynthesis?.cancel();

      setScenarioRecordingSeconds(0);
      if (scenarioCountdownRef.current) clearInterval(scenarioCountdownRef.current);
      scenarioCountdownRef.current = setInterval(() => {
        setScenarioRecordingSeconds(prev => {
          if (prev >= 20) {
            clearInterval(scenarioCountdownRef.current);
            if (scenarioRecorderRef.current?.state === 'recording') {
              scenarioRecorderRef.current.stop();
            }
            setScenarioRecording(false);
            return 20;
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
    // Require at least 1 second of recording to avoid sending noise/silence
    if (scenarioRecordingSeconds < 1) return;
    clearInterval(scenarioCountdownRef.current);
    if (scenarioRecorderRef.current?.state === 'recording') {
      scenarioRecorderRef.current.stop();
    }
    setScenarioRecording(false);
    triggerHaptic();
    playRecordStopSound();
  }

  async function requestHelp() {
    const lastAi = [...scenarioMessagesRef.current].reverse().find(m => m.role === 'ai');
    if (!lastAi || helpLoading) return;
    triggerHaptic();

    // Check cache first — keyed by the AI message text
    const cacheKey = lastAi.text;
    if (scenarioHelpCache.current[cacheKey]) {
      setHelpData(scenarioHelpCache.current[cacheKey]);
      return;
    }

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
        scenarioHelpCache.current[cacheKey] = parsed;
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
    let accumulatedText = "";
    let streamTimeout;

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
      const abortCtrl = new AbortController();
      streamTimeout = setTimeout(() => abortCtrl.abort(), 90000); // 90s timeout

      const response = await fetch(`${supabaseUrl}/functions/v1/scenario-chat`, {
        method: "POST",
        signal: abortCtrl.signal,
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
          voice: scenarioVoice,
        }),
      });

      if (!response.ok) {
        // Handle rate limit
        if (response.status === 429) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || "Daily limit reached. Come back tomorrow!");
        }
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.body) {
        throw new Error("No response body");
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      accumulatedText = "";
      let gotTranscript = false;
      let gotDoneEvent = false;

      // Extract event handling into helper so we can reuse for leftover buffer
      const handleSSEEvent = (event) => {
        if (event.type === "transcript") {
          gotTranscript = true;
          if (event.text && event.text.trim()) {
            playSendSound();
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
          gotDoneEvent = true;
          setStreamingAiText("");
          playReceiveSound();

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
              translation: "",
              hint: "",
              keyPhrase: event.keyPhrase || null,
              isTranslationVisible: false,
            };
            setScenarioMessages(prev => {
              const updated = [...prev, aiMsg];
              scenarioMessagesRef.current = updated;
              return updated;
            });
            setScenarioTurnCount(prev => prev + 1);

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

            // End if server says so, or if 5-minute limit exceeded
            const elapsed = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
            if (event.isEnding || elapsed >= 240) {
              // Freeze elapsed time now before transitioning
              setScenarioFinalElapsed(elapsed);
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
      };

      // Parse SSE lines from a text block
      const parseSSELines = (text) => {
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr) continue;
          let event;
          try { event = JSON.parse(jsonStr); } catch { continue; }
          handleSSEEvent(event);
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }
        if (done) {
          buffer += decoder.decode();
        }

        // Normalize line endings
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Process all complete events (separated by \n\n)
        let eventEnd;
        while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
          const eventBlock = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);
          parseSSELines(eventBlock);
        }

        if (done) {
          // Process any remaining data in buffer (server may not send trailing \n\n)
          if (buffer.trim()) {
            parseSSELines(buffer);
            buffer = "";
          }
          break;
        }
      }

      clearTimeout(streamTimeout);

      // Safety net: if stream ended but we never got a "done" event,
      // use whatever text we accumulated so the response isn't lost
      if (!gotDoneEvent && accumulatedText.trim()) {
        setStreamingAiText("");
        const fallbackMsg = {
          role: "ai",
          text: accumulatedText,
          translation: "",
          hint: "",
          keyPhrase: null,
          isTranslationVisible: false,
        };
        setScenarioMessages(prev => {
          const updated = [...prev, fallbackMsg];
          scenarioMessagesRef.current = updated;
          return updated;
        });
        setScenarioTurnCount(prev => prev + 1);
        speakAiAudio(accumulatedText);
      }

    } catch (e) {
      console.error("Scenario reply exception:", e);
      clearTimeout(streamTimeout);
      setStreamingAiText("");

      // If we have accumulated text (e.g. timeout or partial stream), use it as fallback
      if (accumulatedText && accumulatedText.trim()) {
        const fallbackMsg = {
          role: "ai",
          text: accumulatedText,
          translation: "",
          hint: "",
          keyPhrase: null,
          isTranslationVisible: false,
        };
        setScenarioMessages(prev => {
          const updated = [...prev, fallbackMsg];
          scenarioMessagesRef.current = updated;
          return updated;
        });
        setScenarioTurnCount(prev => prev + 1);
        speakAiAudio(accumulatedText);
      } else {
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
      try {
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
      } catch (e) { }
    };
  }, []);

  // Release audio session when app goes to background (prevents phone-call audio mode)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        try {
          if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
          if (analyserRef.current) analyserRef.current = null;
          if (scenarioRecorderRef.current?.state === 'recording') {
            scenarioRecorderRef.current.stop();
            setScenarioRecording(false);
            if (scenarioCountdownRef.current) { clearInterval(scenarioCountdownRef.current); scenarioCountdownRef.current = null; }
          }
          if (scenarioStreamRef.current) {
            scenarioStreamRef.current.getTracks().forEach(t => t.stop());
            scenarioStreamRef.current = null;
          }
        } catch (e) {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Android hardware back button — mirrors the top-left back button behavior
  const scenarioPhaseRef = useRef(scenarioPhase);
  scenarioPhaseRef.current = scenarioPhase;
  useEffect(() => {
    let handle = null;
    const setup = async () => {
      handle = await CapacitorApp.addListener('backButton', (ev) => {
        ev.preventDefault?.();
        const phase = scenarioPhaseRef.current;
        if (phase === "chat") {
          setShowExitConfirm(true);
        } else {
          resetScenarioChat();
        }
      });
    };
    setup();
    return () => { if (handle) handle.remove(); };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (scenarioChatEndRef.current) {
      scenarioChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scenarioMessages, scenarioLoading, displayedStreamText]);

  // When the scenario ends, fetch curated key phrases from the full conversation
  // in a single call. Replaces the per-turn metadata extraction that used to run
  // on every reply-stream turn.
  const keyPhrasesFetchedRef = useRef(false);
  useEffect(() => {
    if (!scenarioEnded || keyPhrasesFetchedRef.current) return;
    keyPhrasesFetchedRef.current = true;
    const history = (scenarioMessagesRef.current || []).map(m => ({ role: m.role, text: m.text }));
    if (!history.length) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("scenario-chat", {
          body: { action: "extract-phrases", conversationHistory: history },
        });
        if (error) { console.error("extract-phrases failed:", error); return; }
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const phrases = Array.isArray(parsed?.keyPhrases) ? parsed.keyPhrases : [];
        if (phrases.length) setScenarioKeyPhrases(phrases.slice(0, 5));
      } catch (e) {
        console.error("extract-phrases exception:", e);
      }
    })();
  }, [scenarioEnded]);

  if (scenarioPhase) {
    // DIFFICULTY SELECTION
    if (scenarioPhase === "difficulty") {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col pt-12 relative overflow-hidden">
          {/* Background atmosphere */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(ellipse, #E09F3E, transparent 70%)' }} />

          <header className="px-6 pb-4 flex items-center gap-4 z-10">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-11 h-11 rounded-full backdrop-blur border border-border/30 flex items-center justify-center active:scale-95 transition-transform" style={{ background: 'rgba(20,36,56,0.6)' }}>
              <MdArrowBackIosNew className="text-foreground text-lg" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-heading)" }}>Daily Scenario</h1>
            </div>
            <div className="w-11" />
          </header>

          <main className="flex-1 px-6 space-y-6 overflow-y-auto pb-12 relative z-10">
            {/* Hero Banner */}
            <section>
              <div className="scenario-surface relative rounded-[2rem] border border-border/20 overflow-hidden p-6" style={{ background: 'linear-gradient(145deg, rgba(20,36,56,0.82), rgba(13,27,42,0.96))' }}>
                <div className="relative z-10">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(224,159,62,0.1)', border: '1px solid rgba(224,159,62,0.15)' }}>
                      <Icon icon="solar:chat-round-dots-bold" className="text-base" style={{ color: '#E09F3E' }} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(224,159,62,0.7)' }}>Today's Scenario</span>
                  </div>
                  <h2 className="text-[1.7rem] font-bold mb-1.5 tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{scenarioData?.title}</h2>
                  <p dir="rtl" className="text-lg font-bold" style={{ fontFamily: "var(--font-arabic)", color: 'rgba(224,159,62,0.8)' }}>{scenarioData?.titleAr}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground/65 max-w-[22rem]">
                    Pick a level and practise a short real-life Arabic conversation without the extra noise.
                  </p>
                </div>
              </div>
            </section>

            {/* Difficulty cards */}
            <section>
              <h2 className="text-lg font-bold px-1" style={{ fontFamily: "var(--font-heading)" }}>Choose your level</h2>
              <div className="space-y-3.5 pt-8">
                {[
                  { key: "easy", icon: "solar:leaf-bold", labelAr: "مبتدئ", label: "Starter", desc: "Simple, slow, everyday phrases", color: "#22c55e", colorRgb: "34,197,94" },
                  { key: "intermediate", icon: "solar:flame-bold", labelAr: "متوسط", label: "Progressing", desc: "More natural, slightly longer responses", color: "#f59e0b", colorRgb: "245,158,11" },
                  { key: "advanced", icon: "solar:bolt-bold", labelAr: "متقدم", label: "Advanced", desc: "Advanced Arabic, rich vocab", color: "#ef4444", colorRgb: "239,68,68" },
                ].map((d, idx) => (
                  <motion.button
                    key={d.key}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 + idx * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="difficulty-card w-full relative overflow-hidden rounded-[1.5rem] border shadow-lg active:scale-[0.97] transition-transform text-left"
                    style={{ borderColor: `rgba(${d.colorRgb},0.15)`, background: `linear-gradient(145deg, rgba(${d.colorRgb},0.06), rgba(13,27,42,0.95))` }}
                    onClick={() => { triggerHaptic(); startScenarioChat(d.key); }}
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-3.5">
                        <div className="w-12 h-12 rounded-[1.1rem] flex items-center justify-center flex-shrink-0" style={{ background: `rgba(${d.colorRgb},0.08)`, border: `1px solid rgba(${d.colorRgb},0.12)` }}>
                          <Icon icon={d.icon} className="text-[1.65rem]" style={{ color: d.color }} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2.5 mb-1">
                            <h3 className="font-bold text-[15px] tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{d.label}</h3>
                            <span dir="rtl" className="text-[13px] font-semibold" style={{ fontFamily: "var(--font-arabic)", color: `rgba(${d.colorRgb},0.8)` }}>{d.labelAr}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/55 leading-relaxed">{d.desc}</p>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </section>
          </main>
        </div>
      );
    }

    // BRIEFING SCREEN
    if (scenarioPhase === "briefing") {
      const words = scenarioData?.id ? (scenarioVocab[scenarioData.id] || []) : [];
      const userSetting = scenarioData?.id ? (scenarioContext[scenarioData.id] || scenarioData?.setting) : scenarioData?.setting;

      return (
        <div className="h-screen bg-background text-foreground font-sans relative flex flex-col pt-12 overflow-hidden">
          {/* Atmospheric background */}
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[400px] opacity-[0.05] pointer-events-none" style={{ background: 'radial-gradient(ellipse, #E09F3E, transparent 70%)' }} />

          <header className="px-6 pb-4 flex items-center justify-between z-10 w-full flex-shrink-0">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-11 h-11 rounded-full backdrop-blur border border-border/30 flex items-center justify-center active:scale-95 transition-transform" style={{ background: 'rgba(20,36,56,0.6)' }}>
              <MdArrowBackIosNew className="text-foreground text-lg" />
            </button>
            {scenarioLoading ? (
              <div className="rounded-full px-4 py-2 border border-border/30 flex flex-row items-center gap-2.5" style={{ background: 'rgba(20,36,56,0.6)', backdropFilter: 'blur(12px)' }}>
                <Leapfrog size="20" speed="2.5" color="var(--primary)" />
                <span className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-[0.2em]">Connecting</span>
              </div>
            ) : (
              <div className="rounded-full px-4 py-2 border flex flex-row items-center gap-2" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.15)', backdropFilter: 'blur(12px)' }}>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 text-[10px] font-bold uppercase tracking-[0.2em]">Ready</span>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-6 pb-4 z-10 space-y-5">
            {/* Hero */}
            <div className="flex flex-col items-center justify-center text-center pt-3 pb-1">
              <div className="w-[4.5rem] h-[4.5rem] mb-4 rounded-[1.5rem] border border-border/20 flex items-center justify-center text-[2rem]" style={{ background: 'linear-gradient(145deg, rgba(224,159,62,0.1), rgba(20,36,56,0.92))' }}>
                {scenarioData?.emoji}
              </div>
              <h1 className="text-[1.55rem] font-bold mb-1.5 tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{scenarioData?.title}</h1>
              <p dir="rtl" className="text-base font-bold" style={{ fontFamily: "var(--font-arabic)", color: 'rgba(224,159,62,0.7)' }}>{scenarioData?.titleAr}</p>
            </div>

            {/* Situation card */}
            <div className="scenario-surface relative rounded-2xl p-5 border border-border/20 overflow-hidden" style={{ background: 'linear-gradient(145deg, rgba(20,36,56,0.7), rgba(13,27,42,0.9))' }}>
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(229,107,111,0.08)', border: '1px solid rgba(229,107,111,0.12)' }}>
                  <Icon icon="solar:info-square-bold" className="text-xl" style={{ color: '#E56B6F' }} />
                </div>
                <h3 className="text-base font-bold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>Situation Overview</h3>
              </div>
              <p className="text-muted-foreground/70 leading-[1.7] text-[13px]">{userSetting || "Get ready to practice your Arabic in this real-life scenario."}</p>
            </div>

            {/* Useful words — compact grid */}
            {words.length > 0 && (
              <div className="scenario-surface relative rounded-2xl p-5 border border-border/20 overflow-hidden" style={{ background: 'linear-gradient(145deg, rgba(20,36,56,0.7), rgba(13,27,42,0.9))' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(224,159,62,0.08)', border: '1px solid rgba(224,159,62,0.12)' }}>
                    <Icon icon="solar:book-bookmark-bold" className="text-xl" style={{ color: '#E09F3E' }} />
                  </div>
                  <h3 className="text-base font-bold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
                    Useful Words <span className="text-xs font-medium text-muted-foreground/70">- (click to hear)</span>
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {words.map((w, idx) => (
                    <button
                      key={idx}
                      className="word-grid-item rounded-xl p-3 flex flex-col items-center justify-center text-center gap-1.5 active:scale-95 transition-all w-full"
                      style={{ animationDelay: `${idx * 0.05}s`, background: 'rgba(13,27,42,0.6)', border: '1px solid rgba(42,59,84,0.3)' }}
                      onClick={() => { triggerHaptic(); speakArabic(w.ar); }}
                    >
                      <span dir="rtl" className="text-base font-bold text-foreground" style={{ fontFamily: "var(--font-arabic)" }}>{w.ar}</span>
                      <span className="text-[10px] text-muted-foreground/50 font-medium tracking-wide">{w.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fixed bottom button */}
          <div className="px-6 pb-17 pt-4 z-10 w-full flex-shrink-0" style={{ background: 'linear-gradient(to top, var(--background) 60%, transparent)' }}>
            <button
              disabled={scenarioLoading}
              onClick={() => {
                triggerHaptic();
                markScenarioCompletedForToday?.();
                setScenarioPhase("chat");
                if (scenarioMessages.length > 0) {
                  setTimeout(() => speakAiAudio(scenarioMessages[0].text), 300);
                }
              }}
              className="w-full h-14 rounded-2xl font-bold text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-3 transition-all active:scale-[0.97] relative overflow-hidden"
              style={{
                background: scenarioLoading ? 'rgba(27,42,65,0.8)' : 'linear-gradient(135deg, #E09F3E, #D4922F)',
                color: scenarioLoading ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                boxShadow: scenarioLoading ? 'none' : '0 8px 32px rgba(224,159,62,0.2), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
            >
              {scenarioLoading ? (
                <>
                  <Leapfrog size="22" speed="2.5" color="currentColor" />
                  <span>Preparing...</span>
                </>
              ) : (
                <>
                  <Icon icon="solar:play-bold" className="text-xl" />
                  <span>Start Conversation</span>
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
      return (
        <div className="bg-background text-foreground font-sans flex flex-col h-screen overflow-hidden relative">

          {/* Exit Confirmation Modal */}
          {showExitConfirm && (
            <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => setShowExitConfirm(false)}>
              <div className="bg-card rounded-3xl p-6 max-w-sm w-full border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-heading text-lg font-bold mb-2">Leave conversation?</h3>
                <p className="text-sm text-muted-foreground mb-1">Your progress in this scenario won't be saved.</p>
                <p className="text-xs text-destructive/80 font-medium mb-5">You won't be able to redo this scenario again today.</p>
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
          <header className="px-5 pt-12 pb-4 flex items-center gap-3 bg-background z-10 flex-shrink-0 shadow-sm">
            <button onClick={() => { triggerHaptic(); setShowExitConfirm(true); }} className="w-10 h-10 rounded-full bg-card/80 border border-border/50 flex items-center justify-center active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xl">{scenarioData?.emoji}</span>
              <h1 className="font-heading text-base font-bold">{scenarioData?.title}</h1>
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 z-0">
            {scenarioMessages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* AI avatar */}
                {msg.role === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-secondary/10 border border-border/50 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                    <span className="text-sm">{scenarioData?.emoji || '🗣'}</span>
                  </div>
                )}
                <div
                  className={`shadow-sm ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border/50'
                  }`}
                  style={{
                    maxWidth: '80%',
                    padding: '0.875rem 1rem',
                    borderRadius: msg.role === 'user' ? '1.25rem 1.25rem 0.25rem 1.25rem' : '1.25rem 1.25rem 1.25rem 0.25rem',
                  }}
                >
                  <div dir="rtl" className={`text-lg leading-relaxed font-semibold ${msg.role === 'user' ? '' : ''}`} style={{ fontFamily: "var(--font-arabic)" }}>
                    {msg.text}
                  </div>
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/30">
                      {msg.isTranslationVisible && msg.translation ? (
                        <p className="text-xs text-muted-foreground italic flex-1 leading-normal">{msg.translation}</p>
                      ) : msg.isTranslationVisible && !msg.translation ? (
                        <p className="text-xs text-muted-foreground italic flex-1 leading-normal animate-pulse">Translating...</p>
                      ) : (
                        <button
                          onClick={async () => {
                            triggerHaptic();
                            // Show loading state immediately
                            setScenarioMessages(prev => prev.map((m, idx) => idx === i ? { ...m, isTranslationVisible: true } : m));
                            // If already translated, no need to fetch
                            if (msg.translation) return;
                            try {
                              const { data } = await supabase.functions.invoke("scenario-chat", {
                                body: { action: "translate", text: msg.text },
                              });
                              const translation = typeof data === 'string' ? JSON.parse(data).translation : data?.translation;
                              setScenarioMessages(prev => prev.map((m, idx) => idx === i ? { ...m, translation: translation || "Translation unavailable" } : m));
                            } catch {
                              setScenarioMessages(prev => prev.map((m, idx) => idx === i ? { ...m, translation: "Translation unavailable" } : m));
                            }
                          }}
                          className="text-[11px] text-primary/80 font-bold flex-1 text-left py-1 active:opacity-70 transition-opacity flex items-center gap-1.5"
                        >
                          <Icon icon="solar:translation-bold" className="text-sm" />
                          Translate
                        </button>
                      )}

                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(msg.text); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-all flex-shrink-0 ${
                          playingAudioUrl === msg.text ? "bg-primary/20 text-primary" : "bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        <Icon
                          icon={playingAudioUrl === msg.text ? "solar:pause-bold" : "solar:volume-loud-bold"}
                          className="text-lg"
                        />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Streaming AI reply — smooth typewriter effect */}
            {displayedStreamText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div
                  className="bg-card border border-border/50 shadow-sm"
                  style={{
                    maxWidth: '85%',
                    padding: '1rem',
                    borderRadius: '1.5rem 1.5rem 1.5rem 0.25rem',
                  }}
                >
                  <div dir="rtl" className="text-lg leading-relaxed font-semibold" style={{ fontFamily: "var(--font-arabic)" }}>
                    {displayedStreamText}
                    <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse align-text-bottom" />
                  </div>
                </div>
              </motion.div>
            )}

            {scenarioLoading && !displayedStreamText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-card border border-border/50 shadow-sm flex items-center gap-2" style={{ padding: '0.875rem 1.25rem', borderRadius: '1.25rem 1.25rem 1.25rem 0.25rem' }}>
                  <Leapfrog size="22" speed="2.5" color="var(--primary)" />
                </div>
              </motion.div>
            )}
            <div ref={scenarioChatEndRef} />
          </div>

          {/* Bottom Panel */}
          <div className="bg-card border-t border-border/50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex-shrink-0 flex flex-col relative z-20 pb-safe">

            {/* Expandable panels above buttons — help OR recording */}
            <AnimatePresence>
              {(helpLoading || helpData) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pt-4 pb-2 max-h-[35vh] overflow-y-auto scrollbar-hide">
                    {helpLoading && (
                      <div className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-violet-500/10">
                        <Leapfrog size="20" speed="2.5" color="#8b5cf6" />
                        <span className="text-sm text-violet-500 font-bold">Thinking...</span>
                      </div>
                    )}

                    {helpData && (
                      <div className="bg-gradient-to-br from-violet-500/5 to-indigo-500/5 border border-violet-500/20 rounded-2xl p-4 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon icon="solar:magic-stick-3-bold" className="text-violet-500 text-base" />
                          <span className="text-xs font-bold uppercase tracking-widest text-violet-500">AI Assistant</span>
                          <button
                            onClick={() => { triggerHaptic(); setHelpData(null); }}
                            className="ml-auto w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-transform"
                          >
                            <Icon icon="solar:close-circle-bold" className="text-muted-foreground text-base" />
                          </button>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">
                          {helpData.explanation}
                        </p>

                        {helpData.suggestedResponse && (
                          <div className="bg-card border border-violet-500/15 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Try saying</span>
                              <button
                                onClick={() => { triggerHaptic(); speakAiAudio(helpData.suggestedResponse); }}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-violet-500/10 text-violet-500 active:scale-95 transition-transform"
                              >
                                <Icon icon="solar:volume-loud-bold" className="text-lg" />
                              </button>
                            </div>
                            <div dir="rtl" className="text-xl leading-relaxed font-bold text-violet-600 dark:text-violet-400 text-right" style={{ fontFamily: "var(--font-arabic)" }}>
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
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {scenarioRecording && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pt-4 pb-2">
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest text-red-400">Recording</span>
                        <span className="ml-auto text-xs font-mono font-bold text-muted-foreground">{scenarioRecordingSeconds}s / 20s</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Speak as clearly as possible</p>
                      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-linear"
                          style={{
                            width: `${(scenarioRecordingSeconds / 20) * 100}%`,
                            background: scenarioRecordingSeconds >= 16 ? '#ef4444' : scenarioRecordingSeconds >= 12 ? '#eab308' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Button Row — always in place */}
            <div className="px-6 pb-14 pt-4 bg-card">
              {scenarioEnded ? (
                <button
                  onClick={() => {
                    triggerHaptic();
                    setScenarioPhase("summary");
                    if (onComplete) onComplete();
                  }}
                  className="w-full h-14 rounded-2xl font-bold text-sm uppercase tracking-widest text-white flex items-center justify-center gap-3 active:scale-[0.97] transition-all shadow-[0_8px_30px_rgba(34,197,94,0.3)] bg-gradient-to-r from-green-500 to-emerald-500"
                >
                  <span>Finish & Review</span>
                  <Icon icon="solar:check-circle-bold" className="text-xl" />
                </button>
              ) : (
                <div className="flex items-center justify-center gap-12">
                  {/* AI Help Button — always visible when applicable */}
                  <AnimatePresence>
                    {!scenarioLoading && lastAi && !scenarioEnded && !scenarioRecording && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.5, filter: "blur(6px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, scale: 0.5, filter: "blur(6px)" }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        onClick={() => {
                          triggerHaptic();
                          if (helpData) { setHelpData(null); } else { requestHelp(); }
                        }}
                        disabled={helpLoading}
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors active:scale-95 border ${
                          helpData
                            ? 'bg-violet-500/15 border-violet-500/30 text-violet-500'
                            : helpLoading
                              ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                              : 'bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border-violet-500/20 text-violet-500'
                        }`}
                      >
                        {helpLoading ? (
                          <Leapfrog size="18" speed="2.5" color="#8b5cf6" />
                        ) : (
                          <Icon icon="solar:magic-stick-3-bold" className="text-2xl" />
                        )}
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Mic / Stop Button — always in same position */}
                  <button
                    onClick={() => {
                      if (scenarioRecording) {
                        stopScenarioRecording();
                      } else if (!scenarioLoading) {
                        startScenarioRecording();
                      }
                    }}
                    disabled={scenarioLoading}
                    className={`w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center shadow-lg transition-all duration-200 text-white select-none ${scenarioRecording
                        ? 'bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                        : scenarioLoading
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary active:scale-95 shadow-[0_4px_20px_rgba(224,159,62,0.3)]'
                      }`}
                  >
                    {scenarioLoading ? (
                      <Leapfrog size="24" speed="2.5" color="var(--muted-foreground)" />
                    ) : (
                      <Icon
                        icon={scenarioRecording ? "solar:stop-bold" : "solar:microphone-bold"}
                        className="text-3xl"
                      />
                    )}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      );
    }

    // SUMMARY SCREEN
    if (scenarioPhase === "summary") {
      const elapsedSec = scenarioFinalElapsed ?? (scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0);
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
                        <div dir="rtl" className="text-xl font-bold text-primary mb-1" style={{ fontFamily: "var(--font-arabic)" }}>{kp.arabic}</div>
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
