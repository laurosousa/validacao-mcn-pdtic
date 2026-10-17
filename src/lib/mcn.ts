import { useEffect, useState } from 'react';
import requirementsData from './requirements.json';

export type Dimension = 'normativa' | 'estrategica' | 'operacional' | 'governanca';
export type ExpertProfile = 'gestor_ifes_norte' | 'auditoria_controle' | 'pesquisador_doutor';
export type InstitutionType = 'ifes_norte' | 'ifes_outra_regiao' | 'orgao_controle' | 'outro_orgao_publico' | 'outra_instituicao';
export type Normativity = 'obrigatorio' | 'recomendado' | 'complementar';

export interface Requirement {
  code: string;
  dimension: Dimension;
  text: string;
  legalBasis: string;
  normativity: Normativity;
}
export interface RequirementRating { code: string; clarity: number; relevance: number }
export interface DimensionInput { breadth: number; applicability: number; suggestions?: string | null; duplicateConcerns?: string | null }
export interface SubmissionInput {
  consentAccepted: true;
  profile: ExpertProfile;
  yearsExperience: number;
  institutionType: InstitutionType;
  termVersion: string;
  draftCode: string | null;
  hasDirectUFRRLink: false;
  ratings: RequirementRating[];
  dimensions: Record<Dimension, DimensionInput>;
  additionalComments: string | null;
}
export interface McnConfig {
  surveyReady: boolean;
  tcleUrl: string | null;
  estimatedMinutes: number | null;
  submitUrl: string | null;
  contactEmail: string;
}

export const requirements = requirementsData as Requirement[];

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const localTest = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    return url.protocol === 'https:' || localTest ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Reads public/config.json, which the research team edits to open the collection. */
export async function loadConfig(): Promise<McnConfig> {
  const response = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`config.json: ${response.status}`);
  const raw = (await response.json()) as Record<string, unknown>;
  const tcleUrl = httpsUrl(raw.tcleUrl);
  const submitUrl = httpsUrl(raw.submitUrl);
  const minutes = Number(raw.estimatedMinutes);
  const estimatedMinutes = Number.isSafeInteger(minutes) && minutes > 0 ? minutes : null;
  const contactEmail = typeof raw.contactEmail === 'string' && raw.contactEmail.trim() ? raw.contactEmail.trim() : 'lauro.sousa@ufrr.br';
  return { tcleUrl, submitUrl, estimatedMinutes, contactEmail, surveyReady: Boolean(submitUrl && estimatedMinutes) };
}

export function useConfig() {
  const [state, setState] = useState<{ data?: McnConfig; isLoading: boolean; isError: boolean }>({ isLoading: true, isError: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, isLoading: true, isError: false }));
    loadConfig()
      .then((data) => active && setState({ data, isLoading: false, isError: false }))
      .catch(() => active && setState({ isLoading: false, isError: true }));
    return () => { active = false; };
  }, [attempt]);
  return { ...state, refetch: () => setAttempt((n) => n + 1) };
}

/**
 * Sends the response to the Google Apps Script web app linked to the research spreadsheet.
 * The body goes as text/plain so the browser sends a simple request (no CORS preflight),
 * which Apps Script accepts.
 */
export async function sendSubmission(submitUrl: string, payload: SubmissionInput): Promise<{ id: string; submittedAt: string }> {
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Envio: ${response.status}`);
  const result = (await response.json()) as { ok?: boolean; id?: string; submittedAt?: string; error?: string };
  if (!result.ok || !result.id) throw new Error(result.error || 'Resposta inesperada da planilha.');
  return { id: result.id, submittedAt: result.submittedAt ?? new Date().toISOString() };
}

