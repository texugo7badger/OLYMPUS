/**
 * i18n.ts — v0.0.34: OLYMPUS is global.
 *
 * The Settings language selector used to persist a string that nothing read.
 * This is the real client store: one language for the app chrome, the chat
 * prompt (the gods answer in it), the reference catalog labels/categories,
 * the god display names and the Pattern Studio. Switching applies instantly
 * (useSyncExternalStore) and persists to localStorage + `document.lang`.
 *
 * English is the source of truth; every other language falls back to it for
 * a missing key, so a partial translation can never render blank.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useSyncExternalStore } from 'react';
import { godDisplayName, godDomainText, type GodLanguage } from './god-names';

export const LANGUAGES = [
  { id: 'en', label: 'English', native: 'English', speech: 'en-US' },
  { id: 'pt-BR', label: 'Português', native: 'Português', speech: 'pt-BR' },
  { id: 'es', label: 'Español', native: 'Español', speech: 'es-ES' },
  { id: 'fr', label: 'Français', native: 'Français', speech: 'fr-FR' },
  { id: 'de', label: 'Deutsch', native: 'Deutsch', speech: 'de-DE' },
  { id: 'ja', label: '日本語', native: '日本語', speech: 'ja-JP' },
  { id: 'zh', label: '中文', native: '中文', speech: 'zh-CN' },
] as const;

export type Language = (typeof LANGUAGES)[number]['id'];

const LS_KEY = 'olympus:language';
const DEFAULT_LANGUAGE: Language = 'en';
let current: Language = DEFAULT_LANGUAGE;
let initialized = false;
const listeners = new Set<() => void>();

function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && LANGUAGES.some((l) => l.id === v);
}

function emit(): void {
  for (const fn of listeners) fn();
}

function init(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (isLanguage(stored)) current = stored;
  } catch { /* private mode */ }
  applyDocumentLang();
}

function applyDocumentLang(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current;
}

export function getLanguage(): Language {
  init();
  return current;
}

export function setLanguage(lang: Language): void {
  if (!isLanguage(lang)) return;
  current = lang;
  initialized = true;
  try { window.localStorage.setItem(LS_KEY, lang); } catch { /* private mode */ }
  applyDocumentLang();
  emit();
}

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => DEFAULT_LANGUAGE);
}

/** The BCP-47 tag for speech synthesis. */
export function speechLocale(lang: Language = getLanguage()): string {
  return LANGUAGES.find((l) => l.id === lang)?.speech ?? 'en-US';
}

/** One-line instruction appended to the chat prompt so the god answers in
 *  the selected language (the server receives it as x-olympus-language). */
export function languageInstruction(lang: Language = getLanguage()): string {
  const name = LANGUAGES.find((l) => l.id === lang)?.label ?? 'English';
  return `[OLYMPUS-LANGUAGE ${lang}] The interface language is ${name}. ALL user-facing prose in your reply — explanations, plans, questions, summaries, choices and UI copy — must be written in ${name}. Code, identifiers, file paths, commands and upstream component names stay as-is.`;
}

/* ------------------------------------------------------------------ */
/* God display names (server-safe data in god-names.ts).              */
/* ------------------------------------------------------------------ */
export function godName(god: string | null | undefined, lang: Language = getLanguage()): string {
  return godDisplayName(god, lang as GodLanguage);
}

/* ------------------------------------------------------------------ */
/* Reference categories + localized search aliases.                    */
/* ------------------------------------------------------------------ */
const CATEGORY_KEYS: Record<string, string> = {
  'Interactive elements': 'interactive',
  'Image gallery': 'gallery',
  'Text': 'text',
  'Animation': 'animation',
  'Background animation': 'background',
  'Button': 'button',
  'Border': 'border',
  'Image': 'image',
  'Cursor': 'cursor',
  'Loader': 'loader',
  'Games': 'games',
  'Motion & reveal': 'motion',
  'Adaptive UI': 'adaptive',
  'Team & social': 'team',
  'Feedback & microcopy': 'feedback',
  'Finance & data': 'finance',
};

export function categoryKey(category: string): string {
  return CATEGORY_KEYS[category] ?? 'interactive';
}

export function categoryName(category: string, lang: Language = getLanguage()): string {
  return t(`category.${categoryKey(category)}`, lang);
}

/** Extra search words per language, mapped to the English category/keywords
 *  they should match. This is what makes the catalog search answer in the
 *  selected language, not only in English. */
const SEARCH_ALIASES: Record<Language, Record<string, string[]>> = {
  en: {},
  'pt-BR': {
    botão: ['button'], botoes: ['button'], botões: ['button'], galeria: ['gallery'], carrossel: ['gallery', 'carousel'],
    texto: ['text'], tipografia: ['text'], fundo: ['background', 'animation'], animação: ['animation'], animacoes: ['animation'],
    partículas: ['particle'], particula: ['particle'], cursor: ['cursor'], ponteiro: ['cursor'], carregamento: ['loader'],
    borda: ['border'], moldura: ['border'], imagem: ['image'], fotos: ['image'], jogo: ['game'], jogos: ['game'],
    equipe: ['team'], time: ['team'], dica: ['tooltip'], troca: ['swap'], moeda: ['token'], notificação: ['notification'],
  },
  es: {
    botón: ['button'], boton: ['button'], galería: ['gallery'], galeria: ['gallery'], carrusel: ['gallery', 'carousel'],
    texto: ['text'], tipografía: ['text'], fondo: ['background', 'animation'], animación: ['animation'], partículas: ['particle'],
    cursor: ['cursor'], puntero: ['cursor'], carga: ['loader'], borde: ['border'], imagen: ['image'], foto: ['image'],
    juego: ['game'], equipo: ['team'], consejo: ['tooltip'], intercambio: ['swap'], moneda: ['token'], notificación: ['notification'],
  },
  fr: {
    bouton: ['button'], galerie: ['gallery'], carrousel: ['gallery', 'carousel'], texte: ['text'], typographie: ['text'],
    fond: ['background', 'animation'], animation: ['animation'], particules: ['particle'], curseur: ['cursor'],
    chargement: ['loader'], bordure: ['border'], image: ['image'], photo: ['image'], jeu: ['game'], équipe: ['team'],
    infobulle: ['tooltip'], échange: ['swap'], pièce: ['token'], notification: ['notification'],
  },
  de: {
    schaltfläche: ['button'], knopf: ['button'], galerie: ['gallery'], karussell: ['gallery', 'carousel'], text: ['text'],
    typografie: ['text'], hintergrund: ['background', 'animation'], animation: ['animation'], partikel: ['particle'],
    zeiger: ['cursor'], laden: ['loader'], rahmen: ['border'], bild: ['image'], foto: ['image'], spiel: ['game'],
    team: ['team'], tooltip: ['tooltip'], tausch: ['swap'], münze: ['token'], benachrichtigung: ['notification'],
  },
  ja: {
    ボタン: ['button'], ギャラリー: ['gallery'], カルーセル: ['gallery', 'carousel'], テキスト: ['text'], 文字: ['text'],
    背景: ['background', 'animation'], アニメーション: ['animation'], 粒子: ['particle'], カーソル: ['cursor'],
    読み込み: ['loader'], 枠: ['border'], 画像: ['image'], 写真: ['image'], ゲーム: ['game'], チーム: ['team'],
    ヒント: ['tooltip'], 交換: ['swap'], コイン: ['token'], 通知: ['notification'],
  },
  zh: {
    按钮: ['button'], 画廊: ['gallery'], 轮播: ['gallery', 'carousel'], 文本: ['text'], 字体: ['text'], 背景: ['background', 'animation'],
    动画: ['animation'], 粒子: ['particle'], 光标: ['cursor'], 加载: ['loader'], 边框: ['border'], 图片: ['image'],
    照片: ['image'], 游戏: ['game'], 团队: ['team'], 提示: ['tooltip'], 交换: ['swap'], 代币: ['token'], 通知: ['notification'],
  },
};

/** Expand a query into English search terms for the current language. */
export function searchTerms(query: string, lang: Language = getLanguage()): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = new Set<string>([q]);
  const aliases = SEARCH_ALIASES[lang] ?? {};
  for (const [word, mapped] of Object.entries(aliases)) {
    if (word.includes(q) || q.includes(word)) for (const m of mapped) terms.add(m);
  }
  return [...terms];
}

/* ------------------------------------------------------------------ */
/* The dictionary. English first; every other locale falls back.       */
/* ------------------------------------------------------------------ */
type Dict = Record<string, string>;

const en: Dict = {
  'common.use': 'use', 'common.queue': 'send to queue', 'common.close': 'close', 'common.open': 'open',
  'common.copy': 'copy', 'common.search': 'search', 'common.loadMore': 'load more', 'common.all': 'all',
  'common.library': 'library', 'common.variation': 'variation', 'common.liveStudy': 'live study',
  'common.references': 'references', 'common.active': 'active', 'common.new': 'new', 'common.files': 'files',
  'common.size': 'size', 'common.branch': 'branch', 'common.changes': 'changes', 'common.manifests': 'manifests',
  'common.latestCommit': 'latest commit', 'common.recentFiles': 'recent files', 'common.scripts': 'scripts',
  'common.readme': 'readme', 'common.setActive': 'set active', 'common.openEditor': 'open in editor',
  'common.path': 'path', 'common.noDescription': '(no description)', 'common.noneDetected': 'none detected',
  'common.notGit': 'not a git repository', 'common.nothingRecent': 'nothing recent', 'common.noScripts': 'no package scripts',
  'common.build': 'build', 'common.queued': 'queued', 'common.inFlight': 'in flight', 'common.done': 'done',
  'common.copyLane': 'copy lane', 'common.catalog': 'catalog', 'common.retry': 'retry',
  'terminal.placeholder': 'Ask Apollo anything…', 'terminal.send': 'send', 'terminal.stop': 'stop',
  'terminal.newSession': 'new session', 'terminal.context': 'context', 'terminal.attach': 'attach files',
  'terminal.attachImage': 'attach image', 'terminal.thinking': 'thinking…', 'terminal.working': 'working…',
  'terminal.plan': 'plan', 'terminal.buildQueue': 'build queue', 'terminal.chosenTasks': 'the chosen tasks',
  'terminal.welcome1': 'Olympus Interactive Terminal - speak directly with Apollo.',
  'terminal.welcome2': 'Apollo will interview you, classify your task, and delegate to the right gods.',
  'terminal.uploaded': 'Uploaded {n} file(s)', 'terminal.attachedPrompt': 'attached to this prompt',
  'terminal.image': 'image', 'terminal.speaking': 'speaking…', 'terminal.voiceAuto': 'voice on — the god speaks its answer',
  'references.search': 'search references — black hole, smoky text, carousel, tooltip…',
  'references.count': '{n} references', 'references.noMatch': 'no references match — try a broader term',
  'references.loadMore': 'load more', 'references.left': '{n} left',
  'references.hint': 'Every OriginKit + Skiper component — each card is an OLYMPUS study; search to narrow thousands of patterns to the one you want.',
  'references.interactive': 'interactive — move the pointer',
  'studio.title': 'pattern studio', 'studio.subtitle': 'the machine thinking — live',
  'studio.voice': 'voice', 'studio.say': 'say something…', 'studio.voiceOn': 'voice on — the god speaks its answer',
  'studio.voiceOff': 'voice off — the orb and the language stay here', 'studio.speaking': 'speaking…',
  'studio.gods': 'the gods, live', 'studio.idle': 'the pantheon is idle — start a campaign to watch the patterns.',
  'projects.title': 'Projects', 'projects.new': 'New', 'projects.hint': 'Click a project to open its profile · brain is global',
  'projects.noProjects': 'No projects yet.', 'projects.noProjectsHint': 'Click "New" to create one.',
  'projects.profile': 'project profile',
  'projects.stack': 'stack', 'projects.brief': 'project brief', 'projects.pathMissing': 'path missing',
  'projects.scope': 'scope', 'projects.instincts': 'instincts', 'projects.knowledge': 'knowledge',
  'projects.skills': 'skills', 'projects.parkedAt': 'parked at', 'projects.hops': 'hops',
  'projects.dirty': 'dirty', 'projects.clean': 'clean', 'projects.briefHint': 'what the project is doing now',
  'projects.statusRunning': 'running', 'projects.statusParked': 'parked', 'projects.statusDone': 'done', 'projects.statusIdle': 'idle',
  'settings.language': 'language', 'settings.languageNote': 'applies to the whole OLYMPUS interface and to the chat',
  'settings.appearance': 'Appearance', 'settings.theme': 'theme', 'settings.icon': 'icon', 'settings.stable': 'stable mode',
  'status.artStudio': 'creativity', 'status.artStudioTip': 'Creativity — living particles, the gods thinking, and voice', 'status.notifications': 'notifications',
  'category.interactive': 'interactive elements', 'category.gallery': 'image gallery', 'category.text': 'text',
  'category.animation': 'animation', 'category.background': 'background animation', 'category.button': 'button',
  'category.border': 'border', 'category.image': 'image', 'category.cursor': 'cursor', 'category.loader': 'loader',
  'category.games': 'games', 'category.motion': 'motion & reveal', 'category.adaptive': 'adaptive UI',
  'category.team': 'team & social', 'category.feedback': 'feedback & microcopy', 'category.finance': 'finance & data',
};

const ptBR: Dict = {
  'common.use': 'usar', 'common.queue': 'enviar para a fila', 'common.close': 'fechar', 'common.open': 'abrir',
  'common.copy': 'copiar', 'common.search': 'buscar', 'common.loadMore': 'carregar mais', 'common.all': 'todos',
  'common.library': 'biblioteca', 'common.variation': 'variação', 'common.liveStudy': 'estudo ao vivo',
  'common.references': 'referências', 'common.active': 'ativo', 'common.new': 'novo', 'common.files': 'arquivos',
  'common.size': 'tamanho', 'common.branch': 'branch', 'common.changes': 'alterações', 'common.manifests': 'manifests',
  'common.latestCommit': 'último commit', 'common.recentFiles': 'arquivos recentes', 'common.scripts': 'scripts',
  'common.readme': 'readme', 'common.setActive': 'definir como ativo', 'common.openEditor': 'abrir no editor',
  'common.path': 'caminho', 'common.noDescription': '(sem descrição)', 'common.noneDetected': 'nenhum detectado',
  'common.notGit': 'não é um repositório git', 'common.nothingRecent': 'nada recente', 'common.noScripts': 'sem scripts no package',
  'common.build': 'build', 'common.queued': 'na fila', 'common.inFlight': 'em execução', 'common.done': 'concluído',
  'common.copyLane': 'copiar lane', 'common.catalog': 'catálogo', 'common.retry': 'tentar novamente',
  'terminal.placeholder': 'Pergunte qualquer coisa ao Apolo…', 'terminal.send': 'enviar', 'terminal.stop': 'parar',
  'terminal.newSession': 'nova sessão', 'terminal.context': 'contexto', 'terminal.attach': 'anexar arquivos',
  'terminal.attachImage': 'anexar imagem', 'terminal.thinking': 'pensando…', 'terminal.working': 'trabalhando…',
  'terminal.plan': 'plano', 'terminal.buildQueue': 'fila de builds', 'terminal.chosenTasks': 'as tarefas escolhidas',
  'terminal.welcome1': 'Terminal interativo do OLYMPUS — fale diretamente com Apolo.',
  'terminal.welcome2': 'Apolo vai entrevistar você, classificar a tarefa e delegar aos deuses certos.',
  'terminal.uploaded': '{n} arquivo(s) enviado(s)', 'terminal.attachedPrompt': 'anexado a este prompt',
  'terminal.image': 'imagem', 'terminal.speaking': 'falando…', 'terminal.voiceAuto': 'voz ligada — o deus fala a própria resposta',
  'references.search': 'buscar referências — buraco negro, texto esfumaçado, carrossel, tooltip…',
  'references.count': '{n} referências', 'references.noMatch': 'nenhuma referência encontrada — tente um termo mais amplo',
  'references.loadMore': 'carregar mais', 'references.left': '{n} restantes',
  'references.hint': 'Todos os componentes do OriginKit + Skiper — cada card é um estudo do OLYMPUS; busque para encontrar o padrão certo.',
  'references.interactive': 'interativo — mova o ponteiro',
  'studio.title': 'estúdio de padrões', 'studio.subtitle': 'a máquina pensando — ao vivo',
  'studio.voice': 'voz', 'studio.say': 'diga algo…', 'studio.voiceOn': 'voz ligada — o deus fala a própria resposta',
  'studio.voiceOff': 'voz desligada — o orb e o idioma ficam aqui', 'studio.speaking': 'falando…',
  'studio.gods': 'os deuses, ao vivo', 'studio.idle': 'o panteão está ocioso — inicie uma campanha para ver os padrões.',
  'projects.title': 'Projetos', 'projects.new': 'Novo', 'projects.hint': 'Clique em um projeto para abrir o perfil · o cérebro é global',
  'projects.noProjects': 'Nenhum projeto ainda.', 'projects.noProjectsHint': 'Clique em "Novo" para criar um.',
  'projects.profile': 'perfil do projeto',
  'projects.stack': 'stack', 'projects.brief': 'briefing do projeto', 'projects.pathMissing': 'caminho ausente',
  'projects.scope': 'escopo', 'projects.instincts': 'instintos', 'projects.knowledge': 'conhecimento',
  'projects.skills': 'habilidades', 'projects.parkedAt': 'parado em', 'projects.hops': 'hops',
  'projects.dirty': 'alterado', 'projects.clean': 'limpo', 'projects.briefHint': 'o que o projeto está fazendo agora',
  'projects.statusRunning': 'executando', 'projects.statusParked': 'parado', 'projects.statusDone': 'concluído', 'projects.statusIdle': 'ocioso',
  'settings.language': 'idioma', 'settings.languageNote': 'vale para toda a interface do OLYMPUS e para o chat',
  'settings.appearance': 'Aparência', 'settings.theme': 'tema', 'settings.icon': 'ícone', 'settings.stable': 'modo estável',
  'status.artStudio': 'criatividade', 'status.artStudioTip': 'Criatividade — partículas vivas, os deuses pensando e voz', 'status.notifications': 'notificações',
  'category.interactive': 'elementos interativos', 'category.gallery': 'galeria de imagens', 'category.text': 'texto',
  'category.animation': 'animação', 'category.background': 'animação de fundo', 'category.button': 'botão',
  'category.border': 'borda', 'category.image': 'imagem', 'category.cursor': 'cursor', 'category.loader': 'carregamento',
  'category.games': 'jogos', 'category.motion': 'movimento & revelação', 'category.adaptive': 'UI adaptativa',
  'category.team': 'equipe & social', 'category.feedback': 'feedback & microcopy', 'category.finance': 'finanças & dados',
};

const DICTS: Partial<Record<Language, Dict>> = { en, 'pt-BR': ptBR };

export function t(key: string, lang: Language = getLanguage(), vars?: Record<string, string | number>): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/* Loaded after the base dictionary to keep this file readable. */
import { EXTRA_DICTS } from './i18n-extra';
for (const [lang, dict] of Object.entries(EXTRA_DICTS)) DICTS[lang as Language] = dict;

import { UI_DICTS } from './i18n-ui';
import { STUDIO_DICTS } from './i18n-studio';
for (const [lang, dict] of Object.entries(UI_DICTS)) {
  DICTS[lang as Language] = { ...(DICTS[lang as Language] ?? en), ...dict };
}
for (const [lang, dict] of Object.entries(STUDIO_DICTS)) {
  DICTS[lang as Language] = { ...(DICTS[lang as Language] ?? en), ...dict };
}

/* ------------------------------------------------------------------ */
/* God domains (server-safe data in god-names.ts).                     */
/* ------------------------------------------------------------------ */
export function godDomain(god: string | null | undefined, lang: Language = getLanguage()): string {
  return godDomainText(god, lang as GodLanguage);
}
