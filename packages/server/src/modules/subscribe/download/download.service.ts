import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ApplicationLogger } from '../../../common/application.logger.service.js';
import { CACHE_MANAGER, CacheStore } from '@nestjs/cache-manager';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { FileService } from '../../file/file.service.js';
import { CronJob } from 'cron';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOptionsWhere, In, Repository } from 'typeorm';
import { DownloadItem } from './download-item.entity.js';
import path from 'node:path';
import { DOWNLOAD_DIR, INDEX_DIR, VALID_VIDEO_MIME } from '../../../constants.js';
import { randomUUID } from 'node:crypto';
import { FileSourceEnum, StatusEnum } from '../../../enums/index.js';
import { generateMD5 } from '../../../utils/generate-md5.util.js';
import { aria2, Aria2ClientNotification, Conn as Aria2Connection, open } from 'maria2';
import { DownloadTask } from './download-task.js';
import { File } from '../../file/file.entity.js';
import fs from 'fs-extra';
import { fileTypeFromFile } from 'file-type';
import { DownloadItemState } from './download-item-state.interface.js';
import { FeedEntry } from '@extractus/feed-extractor';
import { RuleFileDescriptor } from '../rule/rule.interface.js';
import { Rule } from '../rule/rule.entity.js';
import { Source } from '../source/source.entity.js';
import { ParseLog } from '../parse-log/parse-log.entity.js';
import { RuleErrorLogService } from '../rule/rule-error-log.service.js';
import { MediaService } from '../../media/media.service.js';
import { SeriesService } from '../../media/series/series.service.js';
import { EpisodeService } from '../../media/episode/episode.service.js';
import { MediaFileService } from '../../media/media-file.service.js';
import { SUBSCRIBE_MODULE_OPTIONS_TOKEN } from '../subscribe.module-definition.js';
import { SubscribeModuleOptions } from '../subscribe.module.interface.js';
import WebSocket from 'ws';
import { RuleService } from '../rule/rule.service.js';

@Injectable()
export class DownloadService implements OnModuleInit {
  private conn: Aria2Connection;
  private tasks = new Map<string, DownloadTask>();

  private static TRACKER_CACHE_KEY = 'download:trackers';
  private logger = new ApplicationLogger(DownloadService.name);

  constructor(
    @InjectRepository(DownloadItem) private downloadItemRepository: Repository<DownloadItem>,
    @Inject(SUBSCRIBE_MODULE_OPTIONS_TOKEN) private options: SubscribeModuleOptions,
    @Inject(CACHE_MANAGER) private cacheStore: CacheStore,
    private scheduleRegistry: SchedulerRegistry,
    private fileService: FileService,
    private ruleService: RuleService,
    private ruleErrorLogService: RuleErrorLogService,
    private mediaService: MediaService,
    private seriesService: SeriesService,
    private episodeService: EpisodeService,
    private mediaFileService: MediaFileService,
  ) {}

  private async onDownloadComplete({ gid }: Aria2ClientNotification) {
    const status = await aria2.tellStatus(this.conn, gid);
    const task = this.tasks.get(status.following ?? gid);
    const localFiles = status.files.filter(({ path }) => fs.existsSync(path));
    if (task) {
      const files: File[] = [];
      for (const file of localFiles) {
        const fileStat = await fs.stat(file.path);
        const fileType = await fileTypeFromFile(file.path);
        const filename = path.basename(file.path);
        const record = await this.fileService.save({
          size: fileStat.size,
          filename: filename,
          name: filename,
          md5: await generateMD5(fs.createReadStream(file.path)),
          mimetype: fileType && fileType.mime,
          source: FileSourceEnum.DOWNLOAD,
          path: file.path,
        });
        files.push(record);
      }

      if (status.following || !status.followedBy) {
        await this.save({ id: task.itemId, status: StatusEnum.SUCCESS });
        task.emit('complete', files, status);
        task.removeAllListeners();
        this.tasks.delete(task.taskId);
      }
    }
  }

  private async onDownloadError({ gid }: Aria2ClientNotification) {
    const status = await aria2.tellStatus(this.conn, gid);
    const task = this.tasks.get(status.following ?? gid);
    if (task) {
      await this.save({ id: task.itemId, status: StatusEnum.FAILED, error: status.errorMessage });
      task.emit('failed', status);
      task.removeAllListeners();
      this.tasks.delete(task.taskId);
    }
  }

  private async onDownloadPause({ gid }: Aria2ClientNotification) {
    const status = await aria2.tellStatus(this.conn, gid);
    const task = this.tasks.get(status.following ?? gid);
    if (task) {
      await this.save({ id: task.itemId, status: StatusEnum.PAUSED });
      task.emit('pause', status);
    }
  }

  private async onDownloadStart({ gid }: Aria2ClientNotification) {
    const status = await aria2.tellStatus(this.conn, gid);
    const task = this.tasks.get(status.following ?? gid);
    if (task) {
      await this.save({ id: task.itemId, status: StatusEnum.PENDING });
      task.emit('start', status);
    }
  }

  private async onDownloadStop({ gid }: Aria2ClientNotification) {
    const status = await aria2.tellStatus(this.conn, gid);
    const task = this.tasks.get(status.following ?? gid);
    if (task) {
      await this.save({ id: task.itemId, status: StatusEnum.FAILED, error: 'Canceled' });
      task.emit('stop', status);
      task.removeAllListeners();
      this.tasks.delete(task.taskId);
    }
  }

  private async initClient() {
    try {
      this.conn = await open(
        new WebSocket(`ws://${this.options.rpcHost}:${this.options.rpcPort}${this.options.rpcPath}`),
        {
          secret: this.options.rpcSecret,
        },
      );
      this.conn.getSocket().addEventListener('close', () => {
        this.logger.error('Aria2 WS connection closed, reconnect in 5 seconds');
        setTimeout(() => this.initClient(), 5000);
      });

      aria2.onBtDownloadComplete(this.conn, this.onDownloadComplete.bind(this));
      aria2.onDownloadComplete(this.conn, this.onDownloadComplete.bind(this));
      aria2.onDownloadError(this.conn, this.onDownloadError.bind(this));
      aria2.onDownloadPause(this.conn, this.onDownloadPause.bind(this));
      aria2.onDownloadStart(this.conn, this.onDownloadStart.bind(this));
      aria2.onDownloadStop(this.conn, this.onDownloadStop.bind(this));

      const { version } = await aria2.getVersion(this.conn);
      this.logger.log(`Download service is running, Aria2 version=${version}`);
    } catch (error) {
      this.logger.error('Aria2 WS connect failed, reconnect in 5 seconds', error.stack, DownloadService.name);
      setTimeout(() => this.initClient(), 5000);
    }
  }

  async onModuleInit() {
    await this.initClient();

    await this.downloadItemRepository.update(
      {
        status: In([StatusEnum.PENDING, StatusEnum.PAUSED]),
      },
      {
        status: StatusEnum.FAILED,
        error: 'Application restarted',
      },
    );

    if (this.options.trackerAutoUpdate) {
      const job = CronJob.from({
        cronTime: CronExpression.EVERY_12_HOURS,
        onTick: async () => {
          await this.updateBtTrackers();
        },
        runOnInit: true,
      });
      this.scheduleRegistry.addCronJob('auto-update-trackers', job);
    }
  }

  private async updateBtTrackers() {
    try {
      const response = await fetch(this.options.trackerUpdateUrl, {
        agent: this.options.httpProxy && new HttpsProxyAgent(this.options.httpProxy),
      });
      const rawText = await response.text();
      const tracker = rawText.replace(/\s+/g, ',');
      await this.cacheStore.set(DownloadService.TRACKER_CACHE_KEY, tracker);
      this.logger.log('Aria2 trackers updated');
    } catch (error) {
      this.logger.error('Aria2 update trackers failed', error.stack, DownloadService.name);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoClean() {
    try {
      await aria2.purgeDownloadResult(this.conn);
    } catch (error) {
      this.logger.error(`Purge download result failed`, error.stack, DownloadService.name);
    }
  }

  private async getState(taskId: string): Promise<DownloadItemState> {
    try {
      let status = await aria2.tellStatus(this.conn, taskId);
      if (status.followedBy && status.followedBy.length > 0) {
        status = await aria2.tellStatus(this.conn, status.followedBy[0]);
      }

      return {
        totalLength: status.totalLength,
        completedLength: status.completedLength,
        downloadSpeed: status.downloadSpeed,
      };
    } catch {
      return undefined;
    }
  }

  async createTask(url: string, props?: DeepPartial<DownloadItem>) {
    const trackers = await this.cacheStore.get<string>(DownloadService.TRACKER_CACHE_KEY);
    const gid = await aria2.addUri(this.conn, [url], {
      'http-proxy': this.options.httpProxy,
      'seed-time': '0',
      'bt-tracker': trackers ?? '',
      dir: path.join(DOWNLOAD_DIR, randomUUID().replace(/-/g, '')),
    });

    const hash = await generateMD5(url);
    const item = await this.save({
      ...props,
      url,
      hash,
      status: StatusEnum.PENDING,
    });

    const task = new DownloadTask(gid, item.id, this.conn);
    this.tasks.set(gid, task);

    return task;
  }

  async createAutoDownloadTask(
    entry: FeedEntry,
    props: {
      item?: DownloadItem;
      rule?: Partial<Rule>;
      source?: Partial<Source>;
      log?: Partial<ParseLog>;
    } = {},
  ) {
    const task = await this.createTask(entry.enclosure.url, {
      id: props.item?.id,
      name: entry.title,
      hash: await generateMD5(entry.enclosure.url),
      url: entry.enclosure.url,
      source: props.source && { id: props.source.id },
      rule: props.rule && { id: props.rule.id },
      log: props.log && { id: props.log.id },
      entry: JSON.stringify(entry),
      error: null,
    });

    task.once('complete', async (files) => {
      // media files
      const mediaFiles = files.filter((file) => VALID_VIDEO_MIME.includes(file.mimetype));
      for (const mediaFile of mediaFiles) {
        // generate file descriptor
        let descriptor: RuleFileDescriptor = {};
        if (props.rule?.id) {
          try {
            const rule = await this.ruleService.findOneBy({ id: props.rule.id });
            if (rule?.file?.isExist) {
              const { hooks, release } = await this.ruleService.createRuleVm(rule.code);
              descriptor = await hooks?.describe?.(entry, mediaFile, mediaFiles);
              release?.();
            }
          } catch (error) {
            await this.ruleErrorLogService.save({
              rule: { id: props.rule.id },
              entry: JSON.stringify(entry),
              error: error.toString(),
            });
          } finally {
            descriptor ??= {};
          }
        }

        // attachment files
        const attachments = files
          .filter((file) => !VALID_VIDEO_MIME.includes(file.mimetype))
          .filter((attachment) => path.dirname(attachment.path) === path.dirname(mediaFile.path));

        // save media
        const { id: mediaId } = await this.mediaService.save({
          name: mediaFile.name,
          isPublic: true,
          ...descriptor.media,
          download: { id: task.itemId },
          file: { id: mediaFile.id },
          attachments: attachments.map(({ id }) => ({ id })),
        });
        const media = await this.mediaService.findOneBy({ id: mediaId });
        await this.mediaFileService.generateMediaFiles(media);

        // move media files
        if (descriptor.savePath) {
          const localPath = path.join(INDEX_DIR, descriptor.savePath);
          const localDir = path.dirname(localPath);
          if (localPath.startsWith(INDEX_DIR)) {
            await fs.ensureDir(localDir);
            await fs.createLink(media.file.path, localPath);
            for (const attachment of attachments) {
              await fs.createLink(attachment.path, path.join(localDir, attachment.filename));
            }
          }
        }

        // save series
        if (descriptor.series?.name) {
          let series = await this.seriesService.findOneBy({
            name: descriptor.series.name,
            season: descriptor.series.season,
          });
          if (!series) {
            series = await this.seriesService.save({
              name: descriptor.series.name,
              season: descriptor.series.season,
            });
          }

          let episode = await this.episodeService.findOneBy({
            title: descriptor.episode?.title ?? entry.title,
            no: descriptor.episode?.no,
          });
          // duplicated episode
          if (episode) {
            if (descriptor.overwriteEpisode ?? true) {
              await this.episodeService.save({
                id: episode.id,
                title: entry.title,
                ...descriptor.episode,
                pubAt: Date.parse(String(entry.published)) ? new Date(entry.published) : undefined,
                media: { id: media.id },
                series: { id: series.id },
              });
            }
          } else {
            // save episode
            await this.episodeService.save({
              title: entry.title,
              ...descriptor.episode,
              pubAt: Date.parse(String(entry.published)) ? new Date(entry.published) : new Date(),
              media: { id: media.id },
              series: { id: series.id },
            });
          }
        }
      }
    });

    return task;
  }

  async getTaskByItemId(id: string) {
    return [...this.tasks.values()].find(({ itemId }) => itemId === id);
  }

  async save(item: DeepPartial<DownloadItem>) {
    return await this.downloadItemRepository.save(item);
  }

  async findOneBy(where: FindOptionsWhere<DownloadItem>) {
    const item = await this.downloadItemRepository.findOneBy(where);
    if (item) {
      const task = await this.getTaskByItemId(item.id);
      item.state = task && (await this.getState(task.taskId));
    }
    return item;
  }

  async findAndCount(options?: FindManyOptions<DownloadItem>) {
    const [result, total] = await this.downloadItemRepository.findAndCount(options);
    for (const item of result) {
      const task = await this.getTaskByItemId(item.id);
      item.state = task && (await this.getState(task.taskId));
    }
    return [result, total] as const;
  }

  async delete(where: FindOptionsWhere<DownloadItem>) {
    const items = await this.downloadItemRepository.find({ where });
    for (const item of items) {
      const task = await this.getTaskByItemId(item.id);
      await task?.remove();
      await this.downloadItemRepository.delete({ id: item.id });
    }

    return items.length > 0;
  }
}
