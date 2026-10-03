import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface RealtimeEvent {
  type: string;
  entity?: string;
  entityId?: number;
  roles?: Role[];
  employeeIds?: number[];
  payload?: Record<string, unknown>;
  timestamp: string;
}

type Subscriber = (event: RealtimeEvent) => void;

@Injectable()
export class RealtimeService {
  private readonly subscribers = new Set<Subscriber>();

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  publish(event: Omit<RealtimeEvent, 'timestamp'>): void {
    const completeEvent: RealtimeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    for (const subscriber of this.subscribers) {
      subscriber(completeEvent);
    }
  }
}
