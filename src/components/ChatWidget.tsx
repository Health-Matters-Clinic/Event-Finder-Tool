import React, { useState, useRef, useEffect } from 'react';
import { Language } from '../types';
import { Button } from './Button';

const HMC_LOGO_URL = 'https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png';

interface Message {
  id: string;
  type: 'user' | 'bot' | 'volunteer';
  content: string;
  timestamp: Date;
  senderName?: string;
}

interface QuickAction {
  label: string;
  labelEs: string;
  icon: string;
  query: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Find Resources',
    labelEs: 'Encontrar Recursos',
    icon: '📋',
    query: 'I need help finding resources',
  },
  {
    label: 'Mental Health Support',
    labelEs: 'Apoyo de Salud Mental',
    icon: '🧠',
    query: 'I need mental health support',
  },
  {
    label: 'Food Assistance',
    labelEs: 'Asistencia Alimentaria',
    icon: '🍎',
    query: 'I need help with food',
  },
  {
    label: 'Housing Help',
    labelEs: 'Ayuda con Vivienda',
    icon: '🏠',
    query: 'I need help with housing',
  },
  {
    label: 'Healthcare Access',
    labelEs: 'Acceso a Salud',
    icon: '🏥',
    query: 'I need help accessing healthcare',
  },
  {
    label: 'Talk to Someone',
    labelEs: 'Hablar con Alguien',
    icon: '💬',
    query: 'I want to talk to a person',
  },
];

interface ChatWidgetProps {
  lang?: Language;
  onRequestLiveChat?: (sessionId: string, messages: Message[]) => void;
  position?: 'bottom-right' | 'bottom-left';
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  lang = 'en',
  onRequestLiveChat,
  position = 'bottom-right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(() => `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [liveChatRequested, setLiveChatRequested] = useState(false);
  const [volunteerConnected, setVolunteerConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      greeting: "Hi there! I'm Sunny Harper, your friendly guide to resources and support. How can I help you today?",
      placeholder: 'Type your message...',
      send: 'Send',
      powered_by: 'Powered by Health Matters Clinic',
      typing: 'Sunny is typing...',
      live_chat_requested: 'Connecting you with a live volunteer...',
      volunteer_connected: 'A volunteer has joined the chat!',
      quick_actions_title: 'How can I help?',
    },
    es: {
      greeting: '¡Hola! Soy Sunny Harper, tu guia amigable para recursos y apoyo. ¿Como puedo ayudarte hoy?',
      placeholder: 'Escribe tu mensaje...',
      send: 'Enviar',
      powered_by: 'Desarrollado por Health Matters Clinic',
      typing: 'Sunny esta escribiendo...',
      live_chat_requested: 'Conectandote con un voluntario...',
      volunteer_connected: '¡Un voluntario se ha unido al chat!',
      quick_actions_title: '¿Como puedo ayudar?',
    },
  };

  const text = t[lang];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send greeting when first opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setTimeout(() => {
        setMessages([
          {
            id: 'greeting',
            type: 'bot',
            content: text.greeting,
            timestamp: new Date(),
            senderName: 'Sunny Harper',
          },
        ]);
      }, 500);
    }
  }, [isOpen, messages.length, text.greeting]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setShowQuickActions(false);
    setIsTyping(true);

    // Check if user wants live chat
    const liveChatKeywords = ['talk to someone', 'real person', 'human', 'live chat', 'volunteer', 'hablar con alguien', 'persona real'];
    const wantsLiveChat = liveChatKeywords.some((kw) => content.toLowerCase().includes(kw));

    if (wantsLiveChat && !liveChatRequested) {
      setLiveChatRequested(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            type: 'bot',
            content: lang === 'en'
              ? "I understand you'd like to speak with someone directly. I'm connecting you with one of our caring volunteers. They'll be with you shortly. In the meantime, is there anything specific I can help you with?"
              : 'Entiendo que te gustaria hablar con alguien directamente. Te estoy conectando con uno de nuestros voluntarios. Estaran contigo en breve. Mientras tanto, ¿hay algo especifico en lo que pueda ayudarte?',
            timestamp: new Date(),
            senderName: 'Sunny Harper',
          },
        ]);
        setIsTyping(false);

        // Notify the portal about live chat request
        if (onRequestLiveChat) {
          onRequestLiveChat(sessionId, messages);
        }

        // Store in localStorage for volunteer portal to pick up
        const chatRequests = JSON.parse(localStorage.getItem('liveChatRequests') || '[]');
        chatRequests.push({
          sessionId,
          messages: [...messages, userMessage],
          requestedAt: new Date().toISOString(),
          status: 'pending',
        });
        localStorage.setItem('liveChatRequests', JSON.stringify(chatRequests));
      }, 1500);
      return;
    }

    // Generate AI response
    setTimeout(() => {
      const response = generateResponse(content, lang);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          type: 'bot',
          content: response,
          timestamp: new Date(),
          senderName: 'Sunny Harper',
        },
      ]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleQuickAction = (action: QuickAction) => {
    handleSendMessage(action.query);
  };

  const positionClasses = position === 'bottom-right' ? 'right-4 sm:right-6' : 'left-4 sm:left-6';

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-[9999] w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#233dff] border-[1.5px] border-black shadow-[0_4px_20px_rgba(35,61,255,0.4)] flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-[0_6px_24px_rgba(35,61,255,0.5)] ${
          isOpen ? 'rotate-0' : ''
        }`}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
        {/* Notification dot */}
        {!isOpen && messages.length === 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          className={`fixed bottom-20 sm:bottom-24 ${positionClasses} z-[9998] w-[calc(100vw-2rem)] sm:w-[380px] h-[500px] sm:h-[550px] bg-white rounded-2xl border-[1.5px] border-black shadow-[0_8px_32px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300`}
        >
          {/* Header */}
          <div className="bg-[#233dff] p-4 flex items-center gap-3 border-b border-black">
            <div className="relative">
              <img
                src={HMC_LOGO_URL}
                alt="Sunny Harper"
                className="w-12 h-12 rounded-full border-2 border-white bg-white object-contain"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg leading-tight">Sunny Harper</h3>
              <p className="text-white/80 text-xs">
                {volunteerConnected
                  ? lang === 'en'
                    ? 'Volunteer Connected'
                    : 'Voluntario Conectado'
                  : lang === 'en'
                  ? 'Resource Navigator'
                  : 'Navegador de Recursos'}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] ${
                    message.type === 'user'
                      ? 'bg-[#233dff] text-white rounded-2xl rounded-br-md'
                      : message.type === 'volunteer'
                      ? 'bg-green-500 text-white rounded-2xl rounded-bl-md'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-md shadow-sm'
                  } px-4 py-3`}
                >
                  {message.type !== 'user' && message.senderName && (
                    <p className={`text-xs font-semibold mb-1 ${message.type === 'volunteer' ? 'text-white/80' : 'text-[#233dff]'}`}>
                      {message.senderName}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Live chat requested notice */}
            {liveChatRequested && !volunteerConnected && (
              <div className="flex justify-center">
                <div className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-4 py-2 rounded-full border border-yellow-200">
                  {text.live_chat_requested}
                </div>
              </div>
            )}

            {/* Volunteer connected notice */}
            {volunteerConnected && (
              <div className="flex justify-center">
                <div className="bg-green-100 text-green-800 text-xs font-semibold px-4 py-2 rounded-full border border-green-200">
                  {text.volunteer_connected}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {showQuickActions && messages.length === 1 && (
            <div className="p-3 bg-white border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {text.quick_actions_title}
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-[#f0f4ff] hover:border-[#233dff] border border-gray-200 rounded-full text-xs font-semibold text-gray-700 transition-all"
                  >
                    <span>{action.icon}</span>
                    {lang === 'en' ? action.label : action.labelEs}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputValue);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={text.placeholder}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-[#233dff] focus:bg-white transition-all"
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="w-10 h-10 rounded-full bg-[#233dff] border-[1.5px] border-black text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a2b99] transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
            <p className="text-[10px] text-gray-400 text-center mt-2">{text.powered_by}</p>
          </div>
        </div>
      )}
    </>
  );
};

// Simple AI response generator based on keywords
function generateResponse(input: string, lang: Language): string {
  const lowerInput = input.toLowerCase();

  // Resource categories and responses
  const responses: Record<string, { en: string; es: string }> = {
    mental_health: {
      en: "I hear you, and mental health is so important. Here are some resources that can help:\n\n🧠 **988 Suicide & Crisis Lifeline** - Call or text 988\n🏥 **LA County Mental Health** - (800) 854-7771\n💚 **NAMI** - National Alliance on Mental Illness\n\nWould you like me to connect you with one of our caring volunteers who can help you find the right support?",
      es: "Te escucho, y la salud mental es muy importante. Aqui hay algunos recursos que pueden ayudar:\n\n🧠 **Linea de Crisis 988** - Llama o envia texto al 988\n🏥 **Salud Mental del Condado de LA** - (800) 854-7771\n💚 **NAMI** - Alianza Nacional de Enfermedades Mentales\n\n¿Te gustaria que te conecte con uno de nuestros voluntarios que puede ayudarte a encontrar el apoyo adecuado?",
    },
    food: {
      en: "I can help you find food assistance! Here are some options:\n\n🍎 **CalFresh** - Food assistance program (apply at GetCalFresh.org)\n🥫 **LA Regional Food Bank** - Find a pantry near you\n🍽️ **2-1-1 LA County** - Dial 211 for local food resources\n\nDo you need help applying for any of these programs?",
      es: "¡Puedo ayudarte a encontrar asistencia alimentaria! Aqui hay algunas opciones:\n\n🍎 **CalFresh** - Programa de asistencia alimentaria (aplica en GetCalFresh.org)\n🥫 **Banco de Alimentos Regional de LA** - Encuentra una despensa cerca de ti\n🍽️ **2-1-1 Condado de LA** - Marca 211 para recursos de comida locales\n\n¿Necesitas ayuda para aplicar a alguno de estos programas?",
    },
    housing: {
      en: "Housing can be tough, but there are resources available:\n\n🏠 **LA County Housing Authority** - (626) 262-4510\n🛏️ **PATH** - People Assisting The Homeless\n📞 **2-1-1 LA** - Call 211 for emergency housing help\n🏡 **Section 8 Vouchers** - Housing choice voucher program\n\nWould you like more specific help based on your situation?",
      es: "La vivienda puede ser dificil, pero hay recursos disponibles:\n\n🏠 **Autoridad de Vivienda del Condado de LA** - (626) 262-4510\n🛏️ **PATH** - Personas Ayudando a los Sin Hogar\n📞 **2-1-1 LA** - Llama al 211 para ayuda de emergencia\n🏡 **Vales Seccion 8** - Programa de vales de vivienda\n\n¿Te gustaria ayuda mas especifica basada en tu situacion?",
    },
    healthcare: {
      en: "Let me help you access healthcare:\n\n🏥 **Medi-Cal** - Free/low-cost health coverage for eligible Californians\n💊 **Community Health Centers** - Sliding scale fees based on income\n🩺 **My Health LA** - For uninsured LA County residents\n❤️ **Health Matters Clinic Events** - Free health screenings!\n\nWould you like help finding a clinic near you or applying for coverage?",
      es: "Dejame ayudarte a acceder a atencion medica:\n\n🏥 **Medi-Cal** - Cobertura de salud gratis/bajo costo para californianos elegibles\n💊 **Centros de Salud Comunitarios** - Tarifas basadas en ingresos\n🩺 **My Health LA** - Para residentes sin seguro del Condado de LA\n❤️ **Eventos de Health Matters Clinic** - ¡Examenes de salud gratis!\n\n¿Te gustaria ayuda para encontrar una clinica cerca de ti o aplicar para cobertura?",
    },
    default: {
      en: "Thanks for reaching out! I'm here to help connect you with resources. You can ask me about:\n\n• Mental health support\n• Food assistance\n• Housing help\n• Healthcare access\n• Utility assistance\n• Legal aid\n\nOr if you'd prefer, I can connect you with a caring volunteer who can provide personalized guidance. What would be most helpful for you?",
      es: "¡Gracias por comunicarte! Estoy aqui para ayudarte a conectar con recursos. Puedes preguntarme sobre:\n\n• Apoyo de salud mental\n• Asistencia alimentaria\n• Ayuda con vivienda\n• Acceso a atencion medica\n• Asistencia con servicios\n• Ayuda legal\n\nO si prefieres, puedo conectarte con un voluntario que puede darte orientacion personalizada. ¿Que seria mas util para ti?",
    },
  };

  // Keyword matching
  if (lowerInput.includes('mental') || lowerInput.includes('anxiety') || lowerInput.includes('depress') || lowerInput.includes('stress') || lowerInput.includes('crisis') || lowerInput.includes('ansiedad') || lowerInput.includes('depres') || lowerInput.includes('estres')) {
    return responses.mental_health[lang];
  }
  if (lowerInput.includes('food') || lowerInput.includes('hungry') || lowerInput.includes('eat') || lowerInput.includes('meal') || lowerInput.includes('comida') || lowerInput.includes('hambre') || lowerInput.includes('comer')) {
    return responses.food[lang];
  }
  if (lowerInput.includes('housing') || lowerInput.includes('rent') || lowerInput.includes('homeless') || lowerInput.includes('shelter') || lowerInput.includes('apartment') || lowerInput.includes('vivienda') || lowerInput.includes('alquiler') || lowerInput.includes('hogar')) {
    return responses.housing[lang];
  }
  if (lowerInput.includes('health') || lowerInput.includes('doctor') || lowerInput.includes('medical') || lowerInput.includes('insurance') || lowerInput.includes('clinic') || lowerInput.includes('salud') || lowerInput.includes('medico') || lowerInput.includes('seguro') || lowerInput.includes('clinica')) {
    return responses.healthcare[lang];
  }

  return responses.default[lang];
}
