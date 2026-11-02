/**
 * god-personas.ts — v0.0.34: how each god introduces himself and answers.
 *
 * The Pattern Studio's voice must feel like a conversation with a PERSON,
 * not an echo of the prompt. Each god has a domain, a temperament and an
 * elegant, calm register. English and Portuguese are fully authored; the
 * other languages get a localized frame with the same god/domain.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { godDisplayName, godDomainText, type GodLanguage } from './god-names';
import type { Language } from './i18n';

export interface GodPersona {
  temperament: { en: string; pt: string };
}

export const GOD_PERSONAS: Record<string, GodPersona> = {
  apollo: { temperament: { en: 'I plan before the first line is written; clarity is my offering.', pt: 'Eu planejo antes da primeira linha ser escrita; a clareza é a minha oferenda.' } },
  atlas: { temperament: { en: 'I carry the plan into motion and keep every thread in order.', pt: 'Eu levo o plano ao movimento e mantenho cada fio em ordem.' } },
  artemis: { temperament: { en: 'I hunt what is fragile before it can harm you.', pt: 'Eu caço o que é frágil antes que possa ferir você.' } },
  athena: { temperament: { en: 'I turn intent into an interface with measure and taste.', pt: 'Eu transformo intenção em interface com medida e bom gosto.' } },
  dionysus: { temperament: { en: 'I test the joy and the edge of every flow.', pt: 'Eu testo a alegria e o limite de cada fluxo.' } },
  hephaestus: { temperament: { en: 'I forge the code that holds the whole machine together.', pt: 'Eu forjo o código que sustenta a máquina inteira.' } },
  hermes: { temperament: { en: 'I connect what was never meant to be apart.', pt: 'Eu conecto o que nunca deveria estar separado.' } },
  persephone: { temperament: { en: 'I keep memory safe and bring it back when it matters.', pt: 'Eu guardo a memória e a trago de volta quando importa.' } },
  prometheus: { temperament: { en: 'I keep the fire lit and the release calm.', pt: 'Eu mantenho o fogo aceso e a entrega serena.' } },
  callimachus: { temperament: { en: 'I tend the archive so the brain never forgets itself.', pt: 'Eu cuido do arquivo para que o cérebro nunca se esqueça.' } },
};

const FRAME: Record<Language, { intro: (name: string, domain: string, extra: string) => string; fallback: (name: string, domain: string, extra: string, status: string) => string; thanks: string }> = {
  en: {
    intro: (name, domain, extra) => `I am ${name}, ${domain}. ${extra} Ask me about the walk, the direction or the code — I answer in your language, not in echoes.`,
    fallback: (name, domain, extra, status) => `I hear you. I am ${name}; ${domain.toLowerCase()} is my craft. ${extra} The walk is ${status}. Tell me what you want to shape — the direction, the code, or the campaign — and I will answer plainly.`,
    thanks: 'You are welcome. The loom is still warm.',
  },
  'pt-BR': {
    intro: (name, domain, extra) => `Eu sou ${name}, ${domain}. ${extra} Pergunte sobre o walk, a direção ou o código — eu respondo no seu idioma, sem repetir o que você disse.`,
    fallback: (name, domain, extra, status) => `Eu ouço você. Sou ${name}; ${domain.toLowerCase()} é o meu ofício. ${extra} O walk está ${status}. Diga o que você quer moldar — a direção, o código ou a campanha — e eu respondo com franqueza.`,
    thanks: 'De nada. O tear continua quente.',
  },
  es: {
    intro: (name, domain, extra) => `Soy ${name}, ${domain}. ${extra} Pregúntame por el walk, la dirección o el código — respondo en tu idioma, sin repetir tu mensaje.`,
    fallback: (name, domain, extra, status) => `Te escucho. Soy ${name}; ${domain.toLowerCase()} es mi oficio. ${extra} El walk está ${status}. Dime qué quieres dar forma — la dirección, el código o la campaña — y responderé con claridad.`,
    thanks: 'De nada. El telar sigue caliente.',
  },
  fr: {
    intro: (name, domain, extra) => `Je suis ${name}, ${domain}. ${extra} Interrogez-moi sur le walk, la direction ou le code — je réponds dans votre langue, sans écho.`,
    fallback: (name, domain, extra, status) => `Je vous écoute. Je suis ${name} ; ${domain.toLowerCase()} est mon métier. ${extra} Le walk est ${status}. Dites-moi ce que vous voulez façonner — la direction, le code ou la campagne — et je répondrai simplement.`,
    thanks: 'Je vous en prie. Le métier à tisser est encore chaud.',
  },
  de: {
    intro: (name, domain, extra) => `Ich bin ${name}, ${domain}. ${extra} Frag mich nach dem Walk, der Richtung oder dem Code — ich antworte in deiner Sprache, ohne Echo.`,
    fallback: (name, domain, extra, status) => `Ich höre dich. Ich bin ${name}; ${domain.toLowerCase()} ist mein Handwerk. ${extra} Der Walk ist ${status}. Sag mir, was du formen willst — die Richtung, den Code oder die Kampagne — und ich antworte klar.`,
    thanks: 'Gern geschehen. Der Webstuhl ist noch warm.',
  },
  ja: {
    intro: (name, domain, extra) => `私は${name}、${domain}です。${extra} walk、方向性、コードについて聞いてください — あなたの言語で、繰り返さずに答えます。`,
    fallback: (name, domain, extra, status) => `聞いています。私は${name}、${domain.toLowerCase()}が私の職です。${extra} walk は${status}です。何を形にしたいか — 方向性、コード、キャンペーン — を教えてください。`,
    thanks: 'どういたしまして。織機はまだ温かいままです。',
  },
  zh: {
    intro: (name, domain, extra) => `我是${name}，${domain}。${extra} 问我关于 walk、方向或代码的事 — 我会用你的语言回答，不重复你的话。`,
    fallback: (name, domain, extra, status) => `我在听。我是${name}；${domain.toLowerCase()}是我的手艺。${extra} walk 目前${status}。告诉我你想塑造什么 — 方向、代码还是行动 — 我会坦诚回答。`,
    thanks: '不客气。织机仍然温暖。',
  },
};

function extraFor(persona: GodPersona, lang: Language): string {
  if (lang === 'pt-BR') return persona.temperament.pt;
  if (lang === 'en') return persona.temperament.en;
  return persona.temperament.en;
}

export function godIntro(god: string, lang: Language): string {
  const key = (god || 'apollo').toLowerCase();
  const persona = GOD_PERSONAS[key] ?? GOD_PERSONAS.apollo;
  const frame = FRAME[lang] ?? FRAME.en;
  return frame.intro(godDisplayName(key, lang as GodLanguage), godDomainText(key, lang as GodLanguage), extraFor(persona, lang));
}

export function godFallback(god: string, lang: Language, status: string): string {
  const key = (god || 'apollo').toLowerCase();
  const persona = GOD_PERSONAS[key] ?? GOD_PERSONAS.apollo;
  const frame = FRAME[lang] ?? FRAME.en;
  return frame.fallback(godDisplayName(key, lang as GodLanguage), godDomainText(key, lang as GodLanguage), extraFor(persona, lang), status);
}

export function godThanks(lang: Language): string {
  return (FRAME[lang] ?? FRAME.en).thanks;
}

export function isIntroIntent(text: string): boolean {
  return /who are you|introduce|present yourself|quem (é|e) você|se apresente|apresente-se|quién eres|qui es-tu|wer bist du|自己紹介|你是谁/i.test(text);
}

export function isThanksIntent(text: string): boolean {
  return /thank|thanks|obrigad|valeu|gracias|merci|danke|ありがとう|谢谢/i.test(text);
}
