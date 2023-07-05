import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EpisodeService } from './episode.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PermissionEnum } from '../../enums/permission.enum';
import { buildException } from '../../utils/build-exception.util';
import { ErrorCodeEnum } from '../../enums/error-code.enum';
import { EpisodeDto } from './episode.dto';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { SeriesService } from './series.service';
import { EpisodeQueryDto } from './episode-query.dto';
import { buildQueryOptions } from '../../utils/build-query-options.util';
import { ApiPaginationResultDto } from '../../utils/api.pagination.result.dto';
import { Episode } from './episode.entity';

@Controller('episode')
@UseGuards(AuthorizationGuard)
@ApiTags('series')
@ApiBearerAuth()
export class EpisodeController {
  constructor(private seriesService: SeriesService, private episodeService: EpisodeService) {}

  @Get(':id')
  @ApiOperation({
    description: '查看单集',
  })
  @RequirePermissions(PermissionEnum.ROOT_OP, PermissionEnum.SERIES_OP, PermissionEnum.SERIES_VIEW)
  async getEpisodeById(@Param('id', ParseIntPipe) id: number) {
    const episode = await this.episodeService.findOneBy({ id });
    if (!episode) {
      throw buildException(NotFoundException, ErrorCodeEnum.NOT_FOUND);
    }

    return episode;
  }

  @Get()
  @ApiOperation({
    description: '查询单集',
  })
  @RequirePermissions(PermissionEnum.ROOT_OP, PermissionEnum.SERIES_OP, PermissionEnum.SERIES_VIEW)
  async queryEpisode(@Query() query: EpisodeQueryDto) {
    const { seriesId } = query;
    const [result, total] = await this.episodeService.findAndCount({
      where: buildQueryOptions<Episode>({
        exact: {
          series: { id: seriesId },
        },
      }),
      skip: query.page * query.size,
      take: query.size,
      order: { [query.sort]: query.order },
    });

    return new ApiPaginationResultDto(result, total, query.page, query.size);
  }

  @Post()
  @ApiOperation({
    description: '创建单集',
  })
  @RequirePermissions(PermissionEnum.ROOT_OP, PermissionEnum.SERIES_OP)
  async createEpisode(@Body() data: EpisodeDto) {
    if (data.seriesId == null) {
      throw buildException(BadRequestException, ErrorCodeEnum.BAD_REQUEST);
    }

    const { id } = await this.episodeService.save({
      ...data,
      series: { id: data.seriesId },
      media: { id: data.mediaId },
    });

    return await this.episodeService.findOneBy({ id });
  }

  @Put(':id')
  @ApiOperation({
    description: '修改单集信息',
  })
  @RequirePermissions(PermissionEnum.ROOT_OP, PermissionEnum.SERIES_OP)
  async updateEpisode(@Param('id', ParseIntPipe) id: number, @Body() data: EpisodeDto) {
    const episode = await this.episodeService.findOneBy({ id });
    if (!episode) {
      throw buildException(NotFoundException, ErrorCodeEnum.NOT_FOUND);
    }

    if (data.seriesId !== undefined) {
      const series = await this.seriesService.findOneBy({ id: data.seriesId });
      if (!series) {
        throw buildException(NotFoundException, ErrorCodeEnum.NOT_FOUND);
      }
    }

    await this.episodeService.save({
      id,
      ...data,
      media: { id: data.mediaId },
    });

    return await this.episodeService.findOneBy({ id });
  }

  @Delete(':id')
  @ApiOperation({
    description: '删除单集',
  })
  @RequirePermissions(PermissionEnum.ROOT_OP, PermissionEnum.SERIES_OP)
  async deleteEpisode(@Param('id', ParseIntPipe) id: number) {
    await this.episodeService.delete({ id });
    return {};
  }
}
