import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Socket } from 'socket.io';
import { LiveService } from './live.service';
import { tap } from 'rxjs';

@Injectable()
export class LiveStateWsInterceptor implements NestInterceptor {
  constructor(private liveService: LiveService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const socket: Socket = context.switchToWs().getClient();
    if (socket.data.live) {
      socket.data.state = await this.liveService.createLiveState(socket.data.live.id);
    }

    return next.handle().pipe(
      tap(async () => {
        if (socket.data.live && socket.data.state) {
          await this.liveService.updateLiveState(socket.data.state);
        }
      }),
    );
  }
}