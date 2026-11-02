/**
 * i18n-projects.ts — v0.0.49 (R49-03): the project surface in seven languages.
 *
 * The profile card grew labels the base dictionaries did not carry (brief,
 * scope, instincts/knowledge/skills, status, dirty/clean). They live here so
 * every locale is complete without editing five huge dictionaries.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

type Dict = Record<string, string>;

const en: Dict = {
  'projects.stack': 'stack',
  'projects.brief': 'project brief',
  'projects.pathMissing': 'path missing',
  'projects.scope': 'scope',
  'projects.instincts': 'instincts',
  'projects.knowledge': 'knowledge',
  'projects.skills': 'skills',
  'projects.parkedAt': 'parked at',
  'projects.hops': 'hops',
  'projects.dirty': 'dirty',
  'projects.clean': 'clean',
  'projects.briefHint': 'what the project is doing now',
  'projects.statusRunning': 'running',
  'projects.statusParked': 'parked',
  'projects.statusDone': 'done',
  'projects.statusIdle': 'idle',
  'references.critique': 'critique',
};

const ptBR: Dict = {
  'projects.stack': 'stack',
  'projects.brief': 'briefing do projeto',
  'projects.pathMissing': 'caminho ausente',
  'projects.scope': 'escopo',
  'projects.instincts': 'instintos',
  'projects.knowledge': 'conhecimento',
  'projects.skills': 'habilidades',
  'projects.parkedAt': 'parado em',
  'projects.hops': 'hops',
  'projects.dirty': 'alterado',
  'projects.clean': 'limpo',
  'projects.briefHint': 'o que o projeto está fazendo agora',
  'projects.statusRunning': 'executando',
  'projects.statusParked': 'parado',
  'projects.statusDone': 'concluído',
  'projects.statusIdle': 'ocioso',
  'references.critique': 'criticar',
};

const es: Dict = {
  'projects.stack': 'stack',
  'projects.brief': 'resumen del proyecto',
  'projects.pathMissing': 'ruta ausente',
  'projects.scope': 'alcance',
  'projects.instincts': 'instintos',
  'projects.knowledge': 'conocimiento',
  'projects.skills': 'habilidades',
  'projects.parkedAt': 'detenido en',
  'projects.hops': 'saltos',
  'projects.dirty': 'modificado',
  'projects.clean': 'limpio',
  'projects.briefHint': 'qué está haciendo el proyecto ahora',
  'projects.statusRunning': 'ejecutando',
  'projects.statusParked': 'detenido',
  'projects.statusDone': 'terminado',
  'projects.statusIdle': 'inactivo',
  'references.critique': 'criticar',
};

const fr: Dict = {
  'projects.stack': 'stack',
  'projects.brief': 'brief du projet',
  'projects.pathMissing': 'chemin manquant',
  'projects.scope': 'portée',
  'projects.instincts': 'instincts',
  'projects.knowledge': 'connaissances',
  'projects.skills': 'compétences',
  'projects.parkedAt': 'arrêté à',
  'projects.hops': 'sauts',
  'projects.dirty': 'modifié',
  'projects.clean': 'propre',
  'projects.briefHint': 'ce que fait le projet maintenant',
  'projects.statusRunning': 'en cours',
  'projects.statusParked': 'arrêté',
  'projects.statusDone': 'terminé',
  'projects.statusIdle': 'inactif',
  'references.critique': 'critiquer',
};

const de: Dict = {
  'projects.stack': 'Stack',
  'projects.brief': 'Projekt-Brief',
  'projects.pathMissing': 'Pfad fehlt',
  'projects.scope': 'Umfang',
  'projects.instincts': 'Instinkte',
  'projects.knowledge': 'Wissen',
  'projects.skills': 'Fähigkeiten',
  'projects.parkedAt': 'angehalten bei',
  'projects.hops': 'Hops',
  'projects.dirty': 'geändert',
  'projects.clean': 'sauber',
  'projects.briefHint': 'was das Projekt gerade tut',
  'projects.statusRunning': 'läuft',
  'projects.statusParked': 'angehalten',
  'projects.statusDone': 'fertig',
  'projects.statusIdle': 'inaktiv',
  'references.critique': 'kritisieren',
};

const ja: Dict = {
  'projects.stack': 'スタック',
  'projects.brief': 'プロジェクト概要',
  'projects.pathMissing': 'パスなし',
  'projects.scope': 'スコープ',
  'projects.instincts': '直感',
  'projects.knowledge': '知識',
  'projects.skills': 'スキル',
  'projects.parkedAt': '停止地点',
  'projects.hops': 'ホップ',
  'projects.dirty': '変更あり',
  'projects.clean': 'クリーン',
  'projects.briefHint': 'プロジェクトの現在の作業',
  'projects.statusRunning': '実行中',
  'projects.statusParked': '停止',
  'projects.statusDone': '完了',
  'projects.statusIdle': '待機',
  'references.critique': '批評',
};

const zh: Dict = {
  'projects.stack': '技术栈',
  'projects.brief': '项目简报',
  'projects.pathMissing': '路径缺失',
  'projects.scope': '范围',
  'projects.instincts': '直觉',
  'projects.knowledge': '知识',
  'projects.skills': '技能',
  'projects.parkedAt': '停驻于',
  'projects.hops': '跳数',
  'projects.dirty': '已修改',
  'projects.clean': '干净',
  'projects.briefHint': '项目当前正在做什么',
  'projects.statusRunning': '运行中',
  'projects.statusParked': '已停驻',
  'projects.statusDone': '已完成',
  'projects.statusIdle': '空闲',
  'references.critique': '点评',
};

export const PROJECT_DICTS: Record<string, Dict> = {
  en,
  'pt-BR': ptBR,
  es,
  fr,
  de,
  ja,
  zh,
};
