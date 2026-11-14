/**
 * Mock DigiLocker and eKYC. Documents come from seed/personas.json and are clearly simulated;
 * the UI shows "Demo mode: simulated DigiLocker" on the consent screen.
 */
import path from 'node:path';
import { SEED_DIR } from '../config/paths';
import { env } from '../config/env';
import { loadPersonas, type Persona } from '../seed/loader';
import type { ConsentStartRequest, FetchedDocument, IVerificationProvider, VerifiedIdentity } from './types';

export class MockVerificationProvider implements IVerificationProvider {
  readonly digilockerMode = 'mock' as const;
  readonly aadhaarMode = 'mock' as const;
  private readonly personas: Persona[] = loadPersonas();

  persona(id?: string | null): Persona {
    return this.personas.find((p) => p.id === id) ?? this.personas[0]!;
  }
  listPersonas(): Array<{ id: string; name: string; language: string }> {
    return this.personas.map((p) => ({ id: p.id, name: p.name, language: p.language }));
  }

  async startConsent(req: ConsentStartRequest): Promise<{ authUrl: string }> {
    // The mock "DigiLocker" consent screen is served by our own PWA.
    return { authUrl: `${env.WEB_BASE_URL}/consent/${req.consentId}?s=${encodeURIComponent(req.state)}` };
  }

  async fetchDocuments(req: { docTypes: string[]; personaId?: string | null }): Promise<FetchedDocument[]> {
    const persona = this.persona(req.personaId);
    return persona.digilockerDocuments.filter((d) => req.docTypes.includes(d.code));
  }

  async verifyIdentity(req: { demoCode?: string; personaId?: string | null }): Promise<VerifiedIdentity> {
    const match = this.personas.find((p) => p.ekyc.demoCode === req.demoCode);
    if (!match) throw new Error('INVALID_DEMO_CODE');
    return { yearOfBirth: match.ekyc.yearOfBirth, gender: match.ekyc.gender as VerifiedIdentity['gender'], state: match.ekyc.state };
  }
}

export const MOCK_SEED_PATH = path.join(SEED_DIR, 'personas.json');
