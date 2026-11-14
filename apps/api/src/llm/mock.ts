/**
 * Deterministic provider (LLM_MODE=mock, and the safety net when Gemini fails). It "reads" the user's
 * message with the offline NLU, decides which tools to call exactly like a model would, and composes
 * the reply from tool results. The orchestrator cannot tell the difference, so the whole stack is testable.
 */
import { composeReply } from '../orchestrator/compose';
import { nlu, type NluOutput } from './mockNlu';
import type { ILLMProvider, LLMRequest, LLMResponse, ToolCall } from './types';

function planFor(n: NluOutput, req: LLMRequest): ToolCall[] {
  const { ctx } = req;
  const calls: ToolCall[] = [];
  if (n.command === 'link') return [{ name: 'check_link', args: { text: ctx.userText } }];
  if (Object.keys(n.fields).length > 0) calls.push({ name: 'update_profile', args: { fields: n.fields } });
  switch (n.command) {
    case 'apply':
      calls.push({ name: 'start_application_guide', args: n.slug ? { slug: n.slug } : {} });
      break;
    case 'next': case 'back': case 'repeat': case 'explain':
      calls.push({ name: 'next_application_step', args: { action: n.command } });
      break;
    case 'no_doc':
      calls.push({ name: 'next_application_step', args: { action: 'no_document' } });
      break;
    case 'results':
      calls.push({ name: 'run_eligibility', args: n.intent.length ? { intent: n.intent } : {} });
      break;
    case 'verify':
      calls.push({ name: 'request_verification', args: {} });
      break;
    case 'tracker':
      calls.push({ name: 'save_tracker', args: { reminderInDays: 7 } });
      break;
    default:
      break;
  }
  const touchesProfile = calls.some((c) => c.name === 'update_profile');
  const hasEligibility = calls.some((c) => c.name === 'run_eligibility');
  // Whenever the profile changed (or the user gave an intent), refresh the results so cards stay current.
  if ((touchesProfile || (n.intent.length > 0 && !n.command)) && !hasEligibility && !calls.some((c) => c.name.includes('application'))) {
    calls.push({ name: 'run_eligibility', args: n.intent.length ? { intent: n.intent } : {} });
  }
  return calls;
}

export class MockLLM implements ILLMProvider {
  readonly name = 'mock' as const;

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const { ctx } = req;
    const n = nlu({
      text: ctx.userText,
      expecting: ctx.lastAskedField,
      inApplication: ctx.hasActiveApplication && ctx.sessionState === 'application',
      schemes: ctx.schemes,
    });
    const plan = planFor(n, req);

    // Calls already made this turn = the results sitting in the conversation.
    const done = req.turns.flatMap((t) => (t.role === 'tool' ? t.results : []));
    if (done.length < plan.length) {
      // run tools one at a time: later calls (apply with no slug) depend on earlier ones having saved state
      return { text: '', calls: [plan[done.length]!] };
    }
    const command = n.command && ['greeting', 'medical_legal', 'distress', 'out_of_scope'].includes(n.command)
      ? (n.command as 'greeting' | 'medical_legal' | 'distress' | 'out_of_scope')
      : undefined;
    return {
      text: composeReply(done, { lang: ctx.language, piiWarning: ctx.piiWarning, nextQuestion: ctx.nextQuestion, ...(command ? { command } : {}) }),
      calls: [],
    };
  }
}
