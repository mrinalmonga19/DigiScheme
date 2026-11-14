import { createStore, type Store } from './db';
import { createLanguageService } from './language';
import type { ResilientLanguageService } from './language/resilient';
import { createLLM, type ResilientLLM } from './llm';
import { Orchestrator } from './orchestrator/orchestrator';
import { ApplicationEngine } from './services/applications';
import { AuditService } from './services/audit';
import { ChatService } from './services/chat';
import { ProfileService } from './services/profile';
import { buildRegistry, type Registry } from './services/registry';
import { TrackerService } from './services/trackers';
import { VerificationService } from './services/verification';
import { createVerificationProvider } from './verification';
import type { IVerificationProvider } from './verification/types';
import type { ToolDeps } from './tools';

export interface AppContext extends ToolDeps {
  store: Store;
  registry: Registry;
  profiles: ProfileService;
  audit: AuditService;
  applications: ApplicationEngine;
  trackers: TrackerService;
  verification: VerificationService;
  language: ResilientLanguageService;
  llm: ResilientLLM;
  provider: IVerificationProvider;
  orchestrator: Orchestrator;
  chat: ChatService;
}

export interface ContextOverrides {
  store?: Store;
  llm?: ResilientLLM;
  language?: ResilientLanguageService;
  provider?: IVerificationProvider;
}

/** Compose every service once. Tests pass overrides (for example an LLM that always fails). */
export async function createContext(over: ContextOverrides = {}): Promise<AppContext> {
  const store = over.store ?? (await createStore());
  const registry = await buildRegistry(store);
  const profiles = new ProfileService(store);
  const audit = new AuditService(store);
  const applications = new ApplicationEngine(store, registry, profiles);
  const trackers = new TrackerService(store);
  const provider = over.provider ?? createVerificationProvider();
  const verification = new VerificationService(store, registry, profiles, audit, provider);
  const language = over.language ?? createLanguageService();
  const llm = over.llm ?? createLLM();
  const deps: ToolDeps = { store, registry, profiles, audit, applications, trackers, verification, language };
  const orchestrator = new Orchestrator(llm, deps);
  const ctx = { ...deps, llm, provider, orchestrator } as AppContext;
  ctx.chat = new ChatService(ctx);
  return ctx;
}
