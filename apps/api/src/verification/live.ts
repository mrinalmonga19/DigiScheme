/**
 * LIVE MODE SCAFFOLD. Not functional until you have credentials.
 *
 * DigiLocker: the Partner API uses an OAuth2 authorization-code flow (with PKCE). Requires onboarding as
 * a DigiLocker requester organisation: https://partners.digitallocker.gov.in
 * Aadhaar eKYC: requires a licensed AUA/KUA agreement with UIDAI. A hackathon team cannot self-serve this.
 *
 * Nothing here is hard-coded: client id, secret, redirect URI and endpoints come from environment variables.
 * Every TODO marks where real API behaviour must be confirmed against the partner documentation you are
 * given at onboarding. Do not guess payloads.
 */
import crypto from 'node:crypto';
import { env } from '../config/env';
import { NotConfiguredError, type ConsentStartRequest, type FetchedDocument, type IVerificationProvider, type VerifiedIdentity } from './types';

export class LiveVerificationProvider implements IVerificationProvider {
  readonly digilockerMode = 'live' as const;
  readonly aadhaarMode = 'live' as const;

  constructor() {
    const missing = ['DIGILOCKER_CLIENT_ID', 'DIGILOCKER_CLIENT_SECRET', 'DIGILOCKER_REDIRECT_URI', 'DIGILOCKER_BASE_URL'].filter(
      (k) => !(env as Record<string, unknown>)[k],
    );
    if (missing.length) throw new NotConfiguredError(`DigiLocker (${missing.join(', ')})`);
  }

  /** Build the authorization URL. PKCE verifier handling is TODO: store it server-side keyed by `state`. */
  async startConsent(req: ConsentStartRequest): Promise<{ authUrl: string }> {
    const codeChallenge = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('base64url'); // TODO: persist the verifier
    const url = new URL('/public/oauth2/1/authorize', env.DIGILOCKER_BASE_URL!); // TODO: confirm path from partner docs
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: env.DIGILOCKER_CLIENT_ID!,
      redirect_uri: env.DIGILOCKER_REDIRECT_URI!,
      state: req.state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return { authUrl: url.toString() };
  }

  async fetchDocuments(_req: { userId: string; docTypes: string[]; authCode?: string }): Promise<FetchedDocument[]> {
    // TODO: 1) exchange authCode at the token endpoint (client secret from env, never logged)
    //       2) list issued documents, 3) fetch only the requested doc types, 4) parse issuer metadata,
    //       5) map to FetchedDocument, 6) discard the raw files (we keep derived attributes only).
    throw new NotConfiguredError('DigiLocker token exchange and document fetch');
  }

  async verifyIdentity(_req: { otpTxnId?: string; otp?: string }): Promise<VerifiedIdentity> {
    // TODO: eKYC through a licensed AUA/KUA (env AADHAAR_KUA_ENDPOINT). We never receive or store the Aadhaar
    // number or OTP: the user enters them on the licensed provider's own page, and we get back only
    // name-free demographics (year of birth, gender, state).
    throw new NotConfiguredError('Aadhaar eKYC (AUA/KUA)');
  }
}
