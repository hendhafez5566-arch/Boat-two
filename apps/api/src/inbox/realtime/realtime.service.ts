import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantBus } from './tenant-bus';

export type RealtimeEvent =
  | { type: 'message'; conversationId: string; message: Record<string, unknown> }
  | { type: 'message_status'; conversationId: string; messageId: string; status: string; error?: string }
  | { type: 'conversation'; conversationId: string; reason: string };

@Injectable()
export class RealtimeService {
  readonly bus = new TenantBus<RealtimeEvent>();

  @OnEvent('message.created')
  onMessage(e: { tenantId: string; conversationId: string; message: Record<string, unknown> }) {
    this.bus.publish(e.tenantId, { type: 'message', conversationId: e.conversationId, message: e.message });
  }

  @OnEvent('message.status')
  onStatus(e: { tenantId: string; conversationId: string; messageId: string; status: string; error?: string }) {
    this.bus.publish(e.tenantId, { type: 'message_status', conversationId: e.conversationId, messageId: e.messageId, status: e.status, error: e.error });
  }

  @OnEvent('conversation.updated')
  onConversation(e: { tenantId: string; conversationId: string; reason: string }) {
    this.bus.publish(e.tenantId, { type: 'conversation', conversationId: e.conversationId, reason: e.reason });
  }

  @OnEvent('conversation.handoff')
  onHandoff(e: { tenantId: string; conversationId: string }) {
    this.bus.publish(e.tenantId, { type: 'conversation', conversationId: e.conversationId, reason: 'handoff' });
  }
}
