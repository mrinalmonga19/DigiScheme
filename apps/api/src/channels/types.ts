/** Messaging channel contract (spec 4.2: IMessagingChannel). WhatsApp is the first implementation. */
export interface InboundMessage {
  id: string;
  /** Channel-specific sender id, e.g. "whatsapp:+919876543210". */
  from: string;
  phone: string;
  text: string;
  media: Array<{ url: string; contentType: string }>;
}
export interface OutboundMessage { body: string; mediaUrl?: string }

export interface IMessagingChannel {
  readonly name: 'whatsapp';
  readonly mode: 'twilio' | 'mock';
  /** True when the request really came from the provider (HMAC signature check). */
  validate(args: { signature: string | undefined; url: string; params: Record<string, string> }): boolean;
  parseInbound(params: Record<string, string>): InboundMessage;
  /** Provider-formatted synchronous reply (TwiML). */
  renderReply(messages: OutboundMessage[]): string;
  /** Push a message outside a webhook (reminders). */
  send(toPhone: string, message: OutboundMessage): Promise<void>;
  fetchMedia(url: string, contentType: string): Promise<Buffer>;
}
