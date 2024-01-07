import { Controller, Get, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PermissionEnum } from '../../enums/permission.enum';
import { SystemService } from './system.service';
import { MINAPLAY_VERSION } from '../../constants';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import process from 'node:process';
import { Response } from 'express';
import { ApplicationLogger } from '../../common/application.logger.service';

@Controller('system')
@UseGuards(AuthorizationGuard)
@ApiTags('system')
@ApiBearerAuth()
@RequirePermissions(PermissionEnum.ROOT_OP)
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Get('status')
  @ApiOperation({
    description: '查看系统运行状态',
  })
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60 * 1000)
  async getStatus() {
    return {
      startAt: this.systemService.startAt,
      memory: await this.systemService.getMemoryUsage(),
      disk: await this.systemService.getDiskUsage(),
      version: MINAPLAY_VERSION,
    };
  }

  @Get('logs')
  @ApiOperation({
    description: '获取程序日志',
  })
  async getApplicationLogs() {
    return {
      logs: ApplicationLogger.getHistoryMessages().join(),
    };
  }

  @Post('restart')
  @ApiOperation({
    description: '重启应用程序',
  })
  async restartApplication(@Res() res: Response) {
    res.json({});
    process.send(JSON.stringify({ type: 'app-restart' }));
  }
}
