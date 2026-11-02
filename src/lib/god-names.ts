/**
 * god-names.ts — v0.0.34: server-safe god names + domains.
 *
 * i18n.ts is a client module ('use client'); server routes cannot call its
 * functions. This file carries the pure data so the studio-chat route can
 * localize a god on the server, while i18n.ts re-exports the same helpers
 * for the client.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type GodLanguage = 'en' | 'pt-BR' | 'es' | 'fr' | 'de' | 'ja' | 'zh';

export const GOD_NAMES: Record<GodLanguage, Record<string, string>> = {
  en: { apollo: 'Apollo', atlas: 'Atlas', artemis: 'Artemis', athena: 'Athena', dionysus: 'Dionysus', hephaestus: 'Hephaestus', hermes: 'Hermes', persephone: 'Persephone', prometheus: 'Prometheus', callimachus: 'Callimachus' },
  'pt-BR': { apollo: 'Apolo', atlas: 'Atlas', artemis: 'Ártemis', athena: 'Atena', dionysus: 'Dionísio', hephaestus: 'Hefesto', hermes: 'Hermes', persephone: 'Perséfone', prometheus: 'Prometeu', callimachus: 'Calímaco' },
  es: { apollo: 'Apolo', atlas: 'Atlas', artemis: 'Ártemis', athena: 'Atenea', dionysus: 'Dioniso', hephaestus: 'Hefesto', hermes: 'Hermes', persephone: 'Perséfone', prometheus: 'Prometeo', callimachus: 'Calímaco' },
  fr: { apollo: 'Apollon', atlas: 'Atlas', artemis: 'Artémis', athena: 'Athéna', dionysus: 'Dionysos', hephaestus: 'Héphaïstos', hermes: 'Hermès', persephone: 'Perséphone', prometheus: 'Prométhée', callimachus: 'Callimaque' },
  de: { apollo: 'Apollon', atlas: 'Atlas', artemis: 'Artemis', athena: 'Athene', dionysus: 'Dionysos', hephaestus: 'Hephaistos', hermes: 'Hermes', persephone: 'Persephone', prometheus: 'Prometheus', callimachus: 'Kallimachos' },
  ja: { apollo: 'アポロン', atlas: 'アトラス', artemis: 'アルテミス', athena: 'アテナ', dionysus: 'ディオニュソス', hephaestus: 'ヘパイストス', hermes: 'ヘルメス', persephone: 'ペルセポネ', prometheus: 'プロメテウス', callimachus: 'カリマコス' },
  zh: { apollo: '阿波罗', atlas: '阿特拉斯', artemis: '阿尔忒弥斯', athena: '雅典娜', dionysus: '狄俄尼索斯', hephaestus: '赫菲斯托斯', hermes: '赫尔墨斯', persephone: '珀耳塞福涅', prometheus: '普罗米修斯', callimachus: '卡利马科斯' },
};

export const GOD_DOMAINS: Record<GodLanguage, Record<string, string>> = {
  en: { apollo: 'Planning & architecture', atlas: 'Orchestration & execution', artemis: 'Security & auditing', athena: 'Frontend & design', dionysus: 'QA & testing', hephaestus: 'Backend code', hermes: 'Integrations & MCPs', persephone: 'Database & persistence', prometheus: 'DevOps & CI/CD', callimachus: 'Vault curation' },
  'pt-BR': { apollo: 'Planejamento e arquitetura', atlas: 'Orquestração e execução', artemis: 'Segurança e auditoria', athena: 'Frontend e design', dionysus: 'QA e testes', hephaestus: 'Código backend', hermes: 'Integrações e MCPs', persephone: 'Banco de dados e persistência', prometheus: 'DevOps e CI/CD', callimachus: 'Curadoria do vault' },
  es: { apollo: 'Planificación y arquitectura', atlas: 'Orquestación y ejecución', artemis: 'Seguridad y auditoría', athena: 'Frontend y diseño', dionysus: 'QA y pruebas', hephaestus: 'Código backend', hermes: 'Integraciones y MCPs', persephone: 'Base de datos y persistencia', prometheus: 'DevOps y CI/CD', callimachus: 'Curaduría del vault' },
  fr: { apollo: 'Planification & architecture', atlas: 'Orchestration & exécution', artemis: 'Sécurité & audit', athena: 'Frontend & design', dionysus: 'QA & tests', hephaestus: 'Code backend', hermes: 'Intégrations & MCPs', persephone: 'Base de données & persistance', prometheus: 'DevOps & CI/CD', callimachus: 'Curation du vault' },
  de: { apollo: 'Planung & Architektur', atlas: 'Orchestrierung & Ausführung', artemis: 'Sicherheit & Audit', athena: 'Frontend & Design', dionysus: 'QA & Tests', hephaestus: 'Backend-Code', hermes: 'Integrationen & MCPs', persephone: 'Datenbank & Persistenz', prometheus: 'DevOps & CI/CD', callimachus: 'Vault-Kuration' },
  ja: { apollo: '計画とアーキテクチャ', atlas: 'オーケストレーションと実行', artemis: 'セキュリティと監査', athena: 'フロントエンドとデザイン', dionysus: 'QA とテスト', hephaestus: 'バックエンドコード', hermes: '統合と MCP', persephone: 'データベースと永続化', prometheus: 'DevOps と CI/CD', callimachus: 'Vault キュレーション' },
  zh: { apollo: '规划与架构', atlas: '编排与执行', artemis: '安全与审计', athena: '前端与设计', dionysus: 'QA 与测试', hephaestus: '后端代码', hermes: '集成与 MCP', persephone: '数据库与持久化', prometheus: 'DevOps 与 CI/CD', callimachus: '知识库策展' },
};

export function godDisplayName(god: string | null | undefined, lang: GodLanguage): string {
  if (!god) return '';
  const key = god.toLowerCase().replace(/^god:/, '');
  return GOD_NAMES[lang]?.[key] ?? GOD_NAMES.en[key] ?? god;
}

export function godDomainText(god: string | null | undefined, lang: GodLanguage): string {
  if (!god) return '';
  const key = god.toLowerCase().replace(/^god:/, '');
  return GOD_DOMAINS[lang]?.[key] ?? GOD_DOMAINS.en[key] ?? '';
}
