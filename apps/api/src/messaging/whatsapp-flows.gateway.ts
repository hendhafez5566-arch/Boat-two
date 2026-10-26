import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GRAPH, ProviderError } from './adapters/adapter';
import { providerFlowSchema } from './whatsapp-flow-contract';
const fields = 'id,name,categories,status,validation_errors,whatsapp_business_account';
@Injectable()
export class WhatsAppFlowsGateway {
  private async request(path: string, token: string, method = 'GET', body?: BodyInit) {
    const response = await fetch(`${GRAPH}/${path}`, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    const data: unknown = await response.json();
    if (!response.ok)
      throw new ProviderError(
        `Meta Flow request failed (${response.status}); refresh account permissions or retry after checking provider status`,
        response.status,
      );
    return data;
  }
  async list(waba: string, token: string) {
    const all = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const result = z
        .object({
          data: z.array(providerFlowSchema),
          paging: z
            .object({
              next: z.string().optional(),
              cursors: z.object({ after: z.string().optional() }).optional(),
            })
            .optional(),
        })
        .parse(
          await this.request(
            `${waba}/flows?fields=${fields}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
            token,
          ),
        );
      all.push(...result.data);
      if (!result.paging?.next) return { items: all, complete: true };
      after = result.paging.cursors?.after;
      if (!after || cursors.has(after))
        throw new Error('Invalid provider pagination; no changes imported');
      cursors.add(after);
    }
    return { items: all, complete: false };
  }
  async get(id: string, token: string) {
    const flow = providerFlowSchema.parse(
      await this.request(`${id}?fields=${fields},preview`, token),
    );
    if (flow.id !== id) throw new Error('Provider Flow ID does not match request');
    return flow;
  }
  async create(waba: string, token: string, name: string, categories: string[]) {
    return z
      .object({ id: z.string().regex(/^\d+$/) })
      .parse(
        await this.request(`${waba}/flows`, token, 'POST', JSON.stringify({ name, categories })),
      );
  }
  async upload(id: string, token: string, definition: unknown) {
    const body = new FormData();
    body.set('name', 'flow.json');
    body.set('asset_type', 'FLOW_JSON');
    body.set(
      'file',
      new Blob([JSON.stringify(definition)], { type: 'application/json' }),
      'flow.json',
    );
    return z
      .object({ success: z.literal(true), validation_errors: z.array(z.record(z.unknown())) })
      .parse(await this.request(`${id}/assets`, token, 'POST', body));
  }
  async transition(id: string, token: string, action: 'publish' | 'deprecate') {
    return z
      .object({ success: z.literal(true) })
      .parse(await this.request(`${id}/${action}`, token, 'POST', JSON.stringify({})));
  }
}
